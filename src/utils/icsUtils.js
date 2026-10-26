// Turns a person into an iCalendar (.ics) file the device's own calendar
// app can import, so reminders are handed off to the OS instead of being
// reimplemented here with web push.
//
// Two files per person are possible, because a person with both dates has
// two genuinely different recurring events:
//
//   'gregorian'  Normally ONE event with `RRULE:FREQ=YEARLY` - the
//                birthday sits on the same month/day forever, so the
//                calendar app can expand it indefinitely on its own.
//                The exception is a 29 February birthday: a yearly rule
//                from Feb 29 fires only in leap years, whereas this app
//                observes it on Feb 28 in common years (see
//                dateUtils.makeGregorianDateSafe). Rather than let the
//                calendar entry contradict the card, leaplings get an
//                enumerated run like the Hebrew case below.
//   'hebrew'     ICS_SERIES_YEARS explicit dates. A Hebrew birthday
//                drifts against the Gregorian calendar every year - the
//                same Hebrew day can land three weeks apart in two
//                consecutive years - so no RRULE describes it. Each
//                year's Gregorian date is computed through
//                @hebcal/hdate and written out.
//
//                How those dates are *packaged* is switchable, because
//                the two options trade against each other and only a
//                real device can settle it: as that many standalone
//                events, or as one event carrying them all on an RDATE.
//                See HEBREW_ICS_AS_SERIES in constants.js for the full
//                trade-off and what to test before flipping it.
//
// All events are all-day (`VALUE=DATE`), which is both correct - a
// birthday has no time of day - and what makes them render as a banner
// rather than a midnight appointment. All-day events are floating by
// definition, so no VTIMEZONE is needed and the event can never shift a
// day because the device travelled.
//
// Each event carries one VALARM at `TRIGGER:PT9H`: nine hours after the
// event's midnight start, i.e. 09:00 on the morning of the birthday.
// From there the OS owns the notification, which is the whole point of
// exporting rather than notifying in-app.
import { HEBREW_ICS_AS_SERIES, ICS_SERIES_YEARS } from '../constants'
import {
  getGregorianOccurrenceSeries,
  getHebrewOccurrenceSeries,
  getNextOccurrence,
  isLeapDayBirthday,
  parseStoredGregorianDate,
} from './dateUtils'
import { isIosDevice } from './platform'

/** RFC 5545 requires CRLF line breaks, not the platform's native ones. */
const CRLF = '\r\n'

/** Max octets per content line before it must be folded (RFC 5545 §3.1). */
const LINE_OCTET_LIMIT = 75

const PRODID = '-//molad//Birthday Tracker//HE'

const CALENDAR_LABEL = {
  gregorian: 'לועזי',
  hebrew: 'עברי',
}

/**
 * Escapes a value for an ICS TEXT property: backslash first (so the
 * escapes added afterwards aren't themselves escaped), then the
 * separators that would otherwise split the value into a list, then
 * newlines into the literal `\n` the format expects.
 */
function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

const encoder = new TextEncoder()

/**
 * Folds one content line to the 75-octet limit, continuing with a
 * leading space.
 *
 * The limit is counted in UTF-8 *octets*, not characters, and every
 * Hebrew letter costs two of them - so a 60-character Hebrew SUMMARY is
 * already over the limit and a naive character-based fold would both
 * miss it and, worse, risk cutting a multi-byte sequence in half and
 * producing mojibake. Iterating with `for...of` walks whole code points,
 * so a character is never split; the leading space of a continuation
 * line counts toward its own octet budget.
 */
function foldLine(line) {
  if (encoder.encode(line).length <= LINE_OCTET_LIMIT) return line

  const parts = []
  let current = ''
  let octets = 0

  for (const char of line) {
    const size = encoder.encode(char).length
    if (octets + size > LINE_OCTET_LIMIT) {
      parts.push(current)
      current = ''
      octets = 1 // the continuation line's leading space
    }
    current += char
    octets += size
  }
  parts.push(current)

  return parts.join(`${CRLF} `)
}

/** `YYYYMMDD`, in local calendar terms - all-day events carry no zone. */
function toIcsDate(date) {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/** DTEND of an all-day event is exclusive, so it is the following day. */
function nextDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
}

/** `YYYYMMDDTHHMMSSZ` - DTSTAMP is always UTC. */
function toIcsTimestamp(date) {
  return `${date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`
}

/**
 * Stable, collision-resistant UID seed for a person.
 *
 * Prefers the server-assigned id, which is already a UUID. Falls back to
 * a hash of the name and birth date for a record that somehow has no id,
 * because a UID has to stay the same across re-exports: that is what
 * lets a second import *update* the existing calendar entry instead of
 * silently creating a duplicate alongside it.
 */
function uidSeed(person) {
  if (person?.id) return String(person.id).replace(/[^\w.-]/g, '')

  const basis = `${person?.name ?? ''}|${person?.gregorianDate ?? ''}`
  let hash = 0
  for (let i = 0; i < basis.length; i += 1) {
    hash = (hash * 31 + basis.charCodeAt(i)) | 0
  }
  return `n${(hash >>> 0).toString(36)}`
}

/** Human-readable birth date for the event body, e.g. "14/05/1990". */
function formatBirthDate(person) {
  const birthDate = parseStoredGregorianDate(person?.gregorianDate)
  if (!birthDate) return null
  const day = String(birthDate.getDate()).padStart(2, '0')
  const month = String(birthDate.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${birthDate.getFullYear()}`
}

/**
 * The event title. Hebrew birthdays are tagged so that a person exported
 * on both calendars produces two distinguishable entries rather than two
 * identical-looking ones on different days.
 */
export function icsSummary(person, calendar) {
  const base = `יום הולדת ל${person?.name ?? ''}`.trim()
  return calendar === 'hebrew' ? `${base} (עברי)` : base
}

// --- UIDs --------------------------------------------------------------
//
// A UID is what an importing calendar matches on to decide "I already
// have this - update it" versus "this is new - add it". Getting it wrong
// doesn't fail loudly; it silently duplicates, and the user only notices
// months later when a birthday shows up twice.
//
// The rule follows the shape of the event, which is why these are two
// separate functions rather than one with a flag:
//
//   recurringUid   For an event that repeats (an RRULE, or an RDATE
//                  list). There is exactly one such event per person
//                  per calendar, so the UID must carry *no date*. It
//                  can't: the DTSTART of a re-export is next year's
//                  occurrence, not this year's, so a date-bearing UID
//                  would differ on every re-export and the calendar
//                  would stack up a fresh recurring series each time.
//   occurrenceUid  For one event out of an enumerated run. Here the
//                  date is required - each year is its own event and
//                  needs its own identity - and it is also stable,
//                  because a given birth date always resolves to the
//                  same calendar day in a given year. A re-export
//                  therefore updates the years it has in common and
//                  only appends the ones that are genuinely new.

function recurringUid(person, calendar) {
  return `${uidSeed(person)}-${calendar}@molad`
}

function occurrenceUid(person, calendar, date) {
  return `${uidSeed(person)}-${calendar}-${toIcsDate(date)}@molad`
}

/**
 * One VEVENT, as an array of unfolded content lines.
 *
 * `uid` is passed in rather than derived here, because only the caller
 * knows whether it is building a recurring event or one slice of an
 * enumerated run - see the note above.
 *
 * Note what is *not* here: an age. On any recurring event an age would
 * be frozen at this year's value and wrong from next year on, so it is
 * only ever written by the enumerated paths, which know the age of each
 * individual occurrence.
 */
function buildEvent({ person, calendar, uid, date, extraLines = [], descriptionLines, stamp }) {
  const summary = icsSummary(person, calendar)
  const description = descriptionLines.filter(Boolean).join('\n')

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${toIcsDate(date)}`,
    `DTEND;VALUE=DATE:${toIcsDate(nextDay(date))}`,
    `SUMMARY:${escapeText(summary)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    ...extraLines,
    // A birthday doesn't make anyone busy, and it isn't an invitation
    // the device should try to RSVP to.
    'TRANSP:TRANSPARENT',
    'CLASS:PRIVATE',
    'CATEGORIES:יום הולדת',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(summary)}`,
    'TRIGGER:PT9H',
    'END:VALARM',
    'END:VEVENT',
  ].filter(Boolean)
}

/**
 * Builds the .ics text for one person on one calendar.
 *
 * @param {object} person
 * @param {'gregorian'|'hebrew'} calendar
 * @param {Date} [today]
 * @returns {{ filename: string, content: string }|null} null when the
 *   record has no usable date for the requested calendar
 */
export function buildBirthdayIcs(person, calendar, today = new Date()) {
  const stamp = toIcsTimestamp(new Date())
  const birthDateLabel = formatBirthDate(person)
  const notes = person?.notes?.trim() || null
  const events = []

  if (calendar === 'gregorian') {
    const occurrence = getNextOccurrence(person, today)
    if (occurrence.isUnset) return null

    if (isLeapDayBirthday(person)) {
      // Enumerated rather than RRULE'd: see the module header.
      for (const entry of getGregorianOccurrenceSeries(person, ICS_SERIES_YEARS, today)) {
        events.push(
          buildEvent({
            person,
            calendar,
            uid: occurrenceUid(person, calendar, entry.date),
            date: entry.date,
            stamp,
            descriptionLines: [
              entry.ageTurning !== null ? `חוגג/ת ${entry.ageTurning}` : null,
              birthDateLabel ? `תאריך הולדת: ${birthDateLabel}` : null,
              notes,
            ],
          }),
        )
      }
    } else {
      events.push(
        buildEvent({
          person,
          calendar,
          uid: recurringUid(person, calendar),
          date: occurrence.gregorian.date,
          stamp,
          extraLines: ['RRULE:FREQ=YEARLY'],
          descriptionLines: [
            birthDateLabel ? `תאריך הולדת: ${birthDateLabel}` : null,
            notes,
          ],
        }),
      )
    }
  } else {
    const series = getHebrewOccurrenceSeries(person, ICS_SERIES_YEARS, today)
    if (series.length === 0) return null

    if (HEBREW_ICS_AS_SERIES) {
      // One event, with every later date listed on an RDATE. DTSTART is
      // implicitly the first instance of a recurrence set, so it is
      // excluded from the list - repeating it there would hand strict
      // importers a duplicate occurrence on day one.
      const [first, ...rest] = series
      const extraLines =
        rest.length > 0
          ? [`RDATE;VALUE=DATE:${rest.map((entry) => toIcsDate(entry.date)).join(',')}`]
          : []

      events.push(
        buildEvent({
          person,
          calendar,
          uid: recurringUid(person, calendar),
          date: first.date,
          stamp,
          extraLines,
          // No age: one description is shared by all 25 occurrences, so
          // any number here would be right once and wrong 24 times. The
          // Hebrew date itself is safe - it is the same every year, which
          // is the entire reason this file exists.
          descriptionLines: [
            `יום הולדת עברי: ${first.label}`,
            birthDateLabel ? `תאריך הולדת לועזי: ${birthDateLabel}` : null,
            notes,
          ],
        }),
      )
    } else {
      for (const entry of series) {
        events.push(
          buildEvent({
            person,
            calendar,
            uid: occurrenceUid(person, calendar, entry.date),
            date: entry.date,
            stamp,
            descriptionLines: [
              `${entry.label}${entry.ageTurning !== null ? ` · חוגג/ת ${entry.ageTurning}` : ''}`,
              birthDateLabel ? `תאריך הולדת לועזי: ${birthDateLabel}` : null,
              notes,
            ],
          }),
        )
      }
    }
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    // Not an invitation: PUBLISH tells the importing app to just add the
    // events rather than treat them as a meeting request.
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(icsSummary(person, calendar))}`,
    ...events.flat(),
    'END:VCALENDAR',
  ]

  return {
    filename: buildFilename(person, calendar),
    // Trailing CRLF: the spec's grammar terminates every content line,
    // including the last, and some importers are strict about it.
    content: `${lines.map(foldLine).join(CRLF)}${CRLF}`,
  }
}

/**
 * Builds the download filename.
 *
 * Hebrew characters are kept - every platform the app targets handles
 * them in filenames, and `יום-הולדת-דוד.ics` is far more useful in a
 * Downloads list than a transliterated slug. Only characters that are
 * genuinely illegal in a path, plus whitespace and dots that would
 * confuse the extension, are replaced.
 */
function buildFilename(person, calendar) {
  const safeName = String(person?.name ?? '')
    .replace(/[\\/:*?"<>|.\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const parts = ['יום-הולדת', safeName, CALENDAR_LABEL[calendar]].filter(Boolean)
  return `${parts.join('-')}.ics`
}

/**
 * Offers the file to the iOS share sheet.
 *
 * Returns `null` - meaning "not done, use the download instead" - for
 * every outcome other than a completed or user-cancelled share, so the
 * caller has one simple thing to check. That covers an iOS version
 * without file sharing (it arrived in 15), a `canShare` that declines
 * the `text/calendar` type, and any failure that isn't the user backing
 * out.
 *
 * `navigator.share` must be called while the browser still considers the
 * page user-activated, so nothing here may be awaited before it - see
 * deliverIcsFile.
 *
 * @returns {Promise<'shared'|'cancelled'|null>}
 */
async function shareIcsFile(blob, filename) {
  if (typeof File === 'undefined' || !navigator.canShare || !navigator.share) return null

  const file = new File([blob], filename, { type: 'text/calendar' })
  // Files only, no `text` or `url`: some platforms reject a mixed
  // payload outright, and a share sheet carrying both a file and a line
  // of text tends to route to a messaging app rather than to Calendar.
  if (!navigator.canShare({ files: [file] })) return null

  try {
    await navigator.share({ files: [file], title: filename })
    return 'shared'
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled'
    return null
  }
}

/** Saves the file via a synthetic anchor click. */
function downloadIcsFile(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoked on a delay rather than immediately: Safari reads the blob
  // asynchronously after the click, and revoking too early cancels the
  // download it just started.
  setTimeout(() => URL.revokeObjectURL(url), 10000)

  return 'downloaded'
}

/**
 * Hands the generated file to the device, by whichever route actually
 * reaches the calendar on that platform.
 *
 * iOS gets the share sheet. A downloaded `.ics` on iOS lands in Files
 * and sits there: the user has to leave the browser, find it, and open
 * it before Calendar sees it at all. The share sheet puts "Add to
 * Calendar" one tap away instead, which is the whole point of exporting
 * the file.
 *
 * Everywhere else gets a download, which is both the platform-native
 * behaviour and the more reliable one. On Android and desktop the share
 * sheet is either absent or populated with messaging targets rather
 * than a calendar, while a downloaded `.ics` is handled directly -
 * Android offers Calendar's import flow on tap, and desktop calendar
 * apps register themselves for the file type.
 *
 * The branch is on the *platform*, not on an API probe, because both
 * routes are technically available in both places; what differs is
 * where the file ends up. See utils/platform.js for why that justifies
 * UA sniffing here.
 *
 * iOS still falls back to a download if the share is unavailable or
 * fails, so the file is never simply lost. A share the user cancelled is
 * reported as such and not retried - they declined, and silently
 * downloading the file anyway would be the app overriding them.
 *
 * Must be called straight out of a click handler: `navigator.share`
 * requires live user activation, and awaiting anything first spends it.
 *
 * @returns {Promise<'downloaded'|'shared'|'cancelled'>}
 */
export async function deliverIcsFile({ filename, content }) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })

  if (isIosDevice()) {
    const outcome = await shareIcsFile(blob, filename)
    if (outcome) return outcome
  }

  return downloadIcsFile(blob, filename)
}
