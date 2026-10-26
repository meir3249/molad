// API service: talks to the Google Apps Script Web App endpoint described
// in spec/dev.md (GET to fetch, POST to add).
//
// Google Apps Script Web Apps do not answer CORS preflight (OPTIONS)
// requests, so this module deliberately avoids anything that would
// trigger one:
//   - No custom request headers (Authorization, x-api-key, x-pin, etc.) -
//     any header outside the CORS-safelisted set forces a preflight that
//     GAS can't answer, and the request fails before it ever reaches the
//     script.
//   - POST bodies are sent with `Content-Type: text/plain;charset=utf-8`,
//     which IS CORS-safelisted, even though the body content is JSON
//     text. Apps Script reads the raw text via `e.postData.contents` and
//     calls `JSON.parse` on it server-side, so this costs nothing on the
//     server while avoiding the `application/json` preflight on the
//     client.
//   - The PIN travels as a query param on GET and inside the JSON body on
//     POST - never as a header.
//   - `redirect: 'follow'` is set explicitly on every request, since Apps
//     Script always serves a successful response via a 302 redirect to a
//     temporary googleusercontent.com URL holding the actual JSON.
//
// Because Apps Script's ContentService cannot set arbitrary HTTP status
// codes from doGet/doPost - success is always 200, and infrastructure
// failures surface as 404/500 HTML pages - the backend cannot signal "bad
// PIN" via a 401/403 status the way a conventional REST API would. Auth
// failures are signaled in the JSON body itself instead (see
// `isAuthErrorMessage` below), matching the deployed backend, which
// returns `{ "error": "Unauthorized: Invalid PIN" }` with a normal 200
// status when the PIN doesn't match.
//
// Wire format vs internal shape
// ------------------------------
// The deployed Sheet's header row is PascalCase (ID, Name, GregorianDate,
// HebrewDate, Notes) and doGet echoes those exact keys back; doPost reads
// lowercase keys off the POST body (body.name, body.gregorianDate, ...).
// The rest of this app works in one consistent camelCase shape
// (person.gregorianDate, ...) - every record crossing this boundary is
// translated in both directions right here, so nowhere else needs to know
// the sheet's column names.
//
// There is no DateType column anymore. A person simply has a mandatory
// GregorianDate and an optional HebrewDate; utils/dateUtils.js derives
// which calendar drives the countdown from which of the two is present.
// Rows that predate that change may still echo a DateType key back - it
// is ignored here and never sent on POST.
//
// HebrewDate itself is a plain, already-formatted string - "21 Nisan",
// "14 Adar II" - passed straight through with no encoding/decoding on
// this side. AddPersonModal.jsx builds that string (via
// utils/dateUtils.js's formatHebrewDateString) before it ever reaches
// this module, and the same module's parseHebrewDateString reads it back
// out when computing a person's next occurrence. This module doesn't
// need to know anything about Hebrew months at all.
//
// Until WEBHOOK_URL is replaced with a real deployed Apps Script /exec
// URL, this module transparently falls back to localStorage so the app is
// fully functional standalone.
import { WEBHOOK_URL, PEOPLE_STORAGE_KEY } from '../constants'
import { parseStoredGregorianDate } from '../utils/dateUtils'

function isWebhookConfigured() {
  return WEBHOOK_URL.includes('script.google.com') && !WEBHOOK_URL.includes('REPLACE_WITH_YOUR_SCRIPT_ID')
}

function readLocalPeople() {
  try {
    const raw = localStorage.getItem(PEOPLE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeLocalPeople(people) {
  localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people))
}

export class AuthError extends Error {}

/** True for any error string the deployed backend uses to signal a rejected PIN. */
function isAuthErrorMessage(message) {
  return typeof message === 'string' && /unauthorized|invalid pin|forbidden/i.test(message)
}

/** Converts one raw sheet row (PascalCase, as echoed by doGet) into the app's internal Person shape. */
function normalizeIncoming(raw) {
  return {
    id: raw.ID || raw.id || crypto.randomUUID(),
    name: raw.Name ?? raw.name ?? '',
    gregorianDate: raw.GregorianDate || raw.gregorianDate || null,
    hebrewDate: raw.HebrewDate || raw.hebrewDate || null,
    notes: raw.Notes ?? raw.notes ?? '',
  }
}

/** Converts an internal Person into the lowercase wire payload doPost expects. */
function serializeOutgoing(person) {
  return {
    name: person.name,
    gregorianDate: person.gregorianDate || '',
    hebrewDate: person.hebrewDate || '',
    notes: person.notes || '',
  }
}

/**
 * fetch() wrapper that aborts after `timeoutMs`, turning a silently-stuck
 * request into a clear, catchable error instead of a pending request
 * that never settles. The most common real-world cause of a >50s hang
 * against an Apps Script Web App is a deployment misconfiguration (not
 * redeployed as a new version after the latest code change, or "who has
 * access" not set to "Anyone") rather than anything fetch() itself can
 * retry its way out of, so this fails fast with an actionable message
 * instead of leaving the UI stuck on a spinner. Applied to every request
 * this module makes - GET and POST alike.
 */
async function fetchWithTimeout(url, options, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw withCode(
        new Error(
          'Request to Google Apps Script timed out. Make sure the Web App was redeployed as a NEW version after the last code change, with access set to "Anyone".',
        ),
        'TIMEOUT',
      )
    }
    // A rejected fetch() is a TypeError with no detail by design (the
    // browser won't say whether it was DNS, CORS, or a redirect that
    // couldn't be resolved). Tagged rather than replaced so the original
    // message and stack survive for debugging.
    throw withCode(err, 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
}

/** Attaches a machine-readable code (and extras) so callers can branch on a failure. */
function withCode(error, code, extra = {}) {
  error.code = code
  Object.assign(error, extra)
  return error
}

/**
 * Parses a fetch `Response` defensively.
 *
 * Apps Script normally returns clean JSON once the browser follows its
 * redirect to the temporary content URL, but a misconfigured deployment,
 * expired redirect, or quota error can surface an HTML error page
 * instead. Reading the body as text first and attempting to JSON-parse it
 * (rather than calling `res.json()` directly) turns that case into a
 * clear error instead of an opaque "Unexpected token <" SyntaxError.
 */
async function parseResponse(res) {
  const text = await res.text()

  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw withCode(
      new Error(
        `Unexpected non-JSON response (HTTP ${res.status}). The Apps Script deployment may be misconfigured or unreachable.`,
      ),
      'NON_JSON_BODY',
      { status: res.status },
    )
  }

  // Apps Script signals application-level failures (including a bad PIN)
  // via an `error` field in an otherwise-200 response, not via HTTP status.
  if (body && typeof body === 'object' && typeof body.error === 'string') {
    if (isAuthErrorMessage(body.error)) {
      throw new AuthError(body.error)
    }
    throw new Error(body.error)
  }

  if (!res.ok) {
    throw withCode(new Error(`Request failed (HTTP ${res.status})`), 'HTTP_ERROR', {
      status: res.status,
    })
  }

  return body
}

/**
 * Fetches all birthday records.
 * @param {string} pin
 * @returns {Promise<import('../types').Person[]>}
 */
export async function fetchBirthdays(pin) {
  if (!isWebhookConfigured()) {
    return readLocalPeople()
  }

  const res = await fetchWithTimeout(`${WEBHOOK_URL}?pin=${encodeURIComponent(pin)}`, {
    method: 'GET',
    redirect: 'follow',
    // No headers: any custom header here (Authorization, x-pin, etc.)
    // would force a CORS preflight that Apps Script cannot answer.
  })

  const body = await parseResponse(res)
  return Array.isArray(body) ? body.map(normalizeIncoming) : []
}

/**
 * Asks the backend whether the PIN in hand is the admin PIN.
 *
 * Uses doGet's dedicated `action=isAdmin` branch, which answers
 * `{ isAdmin: boolean }` and skips reading the sheet entirely - so this
 * is a cheap call, which is what lets it run on every first load of a
 * session rather than being cached forever.
 *
 * Why ask the server at all, when the app already holds the PIN and
 * could just compare it to a hardcoded "3249"? Because that would put
 * the admin PIN in the shipped JavaScript bundle, where anyone can read
 * it - and then the admin PIN would also unlock the private rows that
 * doGet gates on it. Only the server knows which PIN is which.
 *
 * Fails closed: anything other than an explicit `true` - a malformed
 * body, an older deployment that doesn't know the action and returns the
 * row array instead - yields `false`, i.e. the read-only UI. An
 * AuthError still propagates, since a rejected PIN has to re-prompt the
 * gate rather than quietly degrade to read-only.
 *
 * In localStorage fallback mode (no real webhook configured) there is no
 * server to ask and no shared sheet to protect, so the single local user
 * is the admin - otherwise the standalone app would have no way to add
 * anyone.
 *
 * @param {string} pin
 * @returns {Promise<boolean>}
 */
export async function fetchIsAdmin(pin) {
  if (!isWebhookConfigured()) return true

  const res = await fetchWithTimeout(
    `${WEBHOOK_URL}?pin=${encodeURIComponent(pin)}&action=isAdmin`,
    { method: 'GET', redirect: 'follow' },
  )

  const body = await parseResponse(res)
  return body?.isAdmin === true
}

// --- write verification -----------------------------------------------
//
// The multi-account echo bug
// --------------------------
// When the browser is signed into more than one Google account, a POST to
// an Apps Script Web App frequently runs to completion - the row IS
// appended to the sheet - and then Google's own 302 to
// script.googleusercontent.com/macros/echo (where the JSON response
// actually lives) comes back 404, or fails to resolve at all. From
// fetch()'s side that is indistinguishable from a failed request, so the
// naive implementation reported "save failed" on a save that had
// succeeded, and the user would add the person a second time.
//
// There is nothing to fix client-side in the request itself; the only
// reliable repair is to stop trusting the POST's response as the sole
// source of truth and go *look* at the sheet instead.

/** How long a write is given to show up in the sheet before we stop waiting. */
const VERIFY_TIMEOUT_MS = 1500

/** Gap between verification polls, for a sheet that hasn't flushed yet. */
const VERIFY_RETRY_DELAY_MS = 450

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/**
 * True when a POST failure carries positive evidence that Google
 * *received and ran* the request, and only the echo hop broke.
 *
 * This does not decide success on its own - verification runs either
 * way. It decides what to believe when verification comes back
 * inconclusive: with evidence the script ran, an unconfirmed write is
 * treated as written; without it, silence is treated as failure.
 *
 *   status 404       the documented echo-redirect 404
 *   NON_JSON_BODY    Google answered with an HTML page, not the JSON
 *                    echo - same failure mode, different surface
 *   NETWORK + online the redirect couldn't be resolved. Gated on
 *                    navigator.onLine because an offline device produces
 *                    the identical TypeError, and there the request never
 *                    left the machine, so nothing was written.
 *
 * Deliberately excluded: TIMEOUT and other HTTP statuses (a 500, say),
 * which commonly mean the script never ran at all.
 */
function looksLikeEchoRedirectFailure(error) {
  if (error.status === 404) return true
  if (error.code === 'NON_JSON_BODY') return true
  if (error.code === 'NETWORK') return isOnline()
  return false
}

/**
 * Finds a just-submitted draft in a freshly fetched list.
 *
 * Name alone is ambiguous (two cousins called דוד כהן), so a row must
 * match on name *and* birth date to count as an exact hit; the date is
 * compared as a parsed calendar day because the sheet may echo back
 * `1990-05-14T00:00:00.000Z` for what was sent as `1990-05-14`. If only
 * the name matches - the sheet's date column empty or reformatted beyond
 * recognition - the last such row is accepted, since rows are appended
 * and the newest is the one just written.
 */
function findSavedPerson(people, draft) {
  const name = String(draft.name ?? '').trim()
  if (!name) return null

  const sameName = people.filter((candidate) => String(candidate.name ?? '').trim() === name)
  if (sameName.length === 0) return null

  const draftDay = parseStoredGregorianDate(draft.gregorianDate)?.getTime()
  const exact = sameName.find(
    (candidate) => parseStoredGregorianDate(candidate.gregorianDate)?.getTime() === draftDay,
  )

  return exact ?? sameName[sameName.length - 1]
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Looks in the sheet for a record that was submitted but never
 * acknowledged, and reports one of:
 *
 *   found        the row is there - the write succeeded
 *   absent       the sheet answered, twice, without it
 *   unauthorized the PIN was rejected (never swallowed as "maybe saved")
 *   inconclusive no answer within the budget, or the lookup itself failed
 *
 * Polls more than once because an Apps Script append is not guaranteed
 * to be visible to the very next read, and the whole thing races a
 * VERIFY_TIMEOUT_MS timer so a slow sheet can never hold the spinner
 * hostage - it just degrades to `inconclusive`, which the caller treats
 * as an optimistic success when the failure looked like the echo bug.
 */
async function confirmWrite(pin, draft, timeoutMs = VERIFY_TIMEOUT_MS) {
  let timer
  const giveUp = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ outcome: 'inconclusive', reason: 'timeout' }), timeoutMs)
  })

  const lookup = (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) await sleep(VERIFY_RETRY_DELAY_MS)
      try {
        const people = await fetchBirthdays(pin)
        const match = findSavedPerson(people, draft)
        if (match) return { outcome: 'found', person: match, people }
        if (attempt === 1) return { outcome: 'absent', people }
      } catch (error) {
        if (error instanceof AuthError) return { outcome: 'unauthorized', error }
        return { outcome: 'inconclusive', reason: 'lookup-failed', error }
      }
    }
    return { outcome: 'inconclusive', reason: 'exhausted' }
  })()

  try {
    // `lookup` never rejects - every throw is mapped to an outcome above -
    // so the timer winning the race can't leave an unhandled rejection
    // behind. The lookup keeps running either way; its result is simply
    // discarded, and the caller's background re-fetch supersedes it.
    return await Promise.race([lookup, giveUp])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Adds a new person record, treating the POST's response as evidence
 * rather than as the verdict.
 *
 * Resolves with a result object instead of a bare Person, because "it
 * saved" and "we know it saved" are different facts the UI has to tell
 * apart:
 *
 *   { success: true, verified: true,  person, people }
 *     Acknowledged by doPost, or found in the sheet afterwards. When it
 *     came from verification, `people` is the full refreshed list - the
 *     caller should prefer it over appending, since it carries the real
 *     server-assigned ids.
 *
 *   { success: true, optimistic: true, person, people: null }
 *     The write almost certainly landed (see
 *     looksLikeEchoRedirectFailure) but could not be confirmed inside
 *     VERIFY_TIMEOUT_MS. The caller should accept it and re-fetch in the
 *     background rather than show a failure.
 *
 * Throws only when the write genuinely did not happen: AuthError for a
 * rejected PIN, or the original transport error when the sheet positively
 * does not contain the record, or when there was no evidence the script
 * ran (offline, timeout, 5xx) and verification couldn't confirm it.
 *
 * @param {string} pin
 * @param {object} person
 */
export async function createBirthday(pin, person) {
  if (!isWebhookConfigured()) {
    const people = readLocalPeople()
    const withId = { ...person, id: crypto.randomUUID() }
    writeLocalPeople([...people, withId])
    return { success: true, verified: true, optimistic: false, person: withId, people: null }
  }

  try {
    const res = await fetchWithTimeout(WEBHOOK_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        // Deliberately NOT 'application/json' - this exact value is
        // CORS-safelisted, which keeps the browser from sending an OPTIONS
        // preflight that Apps Script would fail to answer. The body is
        // still valid JSON text; Apps Script parses it server-side via
        // `JSON.parse(e.postData.contents)`.
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({ pin, ...serializeOutgoing(person) }),
    })

    const body = await parseResponse(res)

    // The deployed doPost only echoes back `{ success, id }`, not the full
    // record. Build the record for an immediate, no-refetch UI update (per
    // qa.md's CRUD requirement) by merging what was just submitted with the
    // id the backend assigned. If doPost is later changed to echo the full
    // row back, that richer response is used instead.
    const saved =
      body && typeof body === 'object' && 'name' in body
        ? normalizeIncoming(body)
        : { ...person, id: body?.id ?? crypto.randomUUID() }

    return { success: true, verified: true, optimistic: false, person: saved, people: null }
  } catch (error) {
    // A rejected PIN is never ambiguous and never optimistic - the write
    // definitely did not happen, and the caller needs to re-prompt.
    if (error instanceof AuthError) throw error

    const confirmation = await confirmWrite(pin, person)

    if (confirmation.outcome === 'found') {
      return {
        success: true,
        verified: true,
        optimistic: false,
        person: confirmation.person,
        people: confirmation.people,
      }
    }

    if (confirmation.outcome === 'unauthorized') throw confirmation.error

    if (confirmation.outcome === 'inconclusive' && looksLikeEchoRedirectFailure(error)) {
      return {
        success: true,
        verified: false,
        optimistic: true,
        person: { ...person, id: crypto.randomUUID() },
        people: null,
      }
    }

    // Either the sheet positively does not contain the record, or nothing
    // suggested the script ever ran. Surface the original transport error.
    throw error
  }
}
