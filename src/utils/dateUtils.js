// Core date utilities for the Birthday Tracker: parsing/validating the
// dd/mm/yyyy input the user types, and answering the one question the feed
// cares about per person - "how many days until their next birthday?" -
// without ever throwing or rendering "Invalid Date" / "NaNd" when a
// record's fields are missing or malformed. That defensive behavior
// matters in practice: a row synced back from the Apps Script backend can
// carry an empty or hand-edited date, and this module must render that as
// a safe placeholder rather than crash the card.
//
// Hebrew calendar math is delegated to @hebcal/hdate, which implements the
// birthday/anniversary postponement algorithm from Reingold & Dershowitz's
// "Calendrical Calculations" (the same algorithm hebcal.com uses). We do not
// hand-roll Hebrew leap-year arithmetic.
import { HDate, birthdayOrAnniversary } from '@hebcal/hdate'
import { HEBREW_MONTHS, HEBREW_DAYS } from '../constants'

/** Shown instead of a computed date whenever a record's date is missing or invalid. */
export const UNSET_DATE_LABEL = 'שגיאה בנתוני תאריך יש לבדוק את תקינות הנתונים'

/** Earliest birth year the Gregorian input accepts. */
export const MIN_BIRTH_YEAR = 1930

// --- Data model -------------------------------------------------------
//
// A person has exactly two date fields:
//
//   gregorianDate - REQUIRED. Stored as ISO `yyyy-mm-dd`. This is the
//     only field that carries a birth *year*, which is what makes "age
//     turning" computable at all.
//   hebrewDate - OPTIONAL. Stored as the plain "{day} {month}" string the
//     sheet has always held, e.g. "21 Nisan" / "14 Adar II". Day + month
//     only, no year.
//
// There is no `DateType` column/field anymore. Which calendar drives a
// person's countdown is derived from what's actually present: a person
// who has a Hebrew date celebrates on the Hebrew date (recomputed each
// year through @hebcal/hdate, postponements included); everyone else
// celebrates on the Gregorian anniversary. Either way the Gregorian date
// supplies the birth year behind "age turning" - see getNextOccurrence.
//
// The "{day} {month}" wire format needs no leap-year flag alongside it
// because "Adar I", "Adar II" and plain "Adar" are three distinct entries
// in HEBREW_MONTHS (see constants.js): the month name alone disambiguates
// every case the date math needs.

/**
 * Parses the "{day} {month}" wire format back into day/month/leapOrigin.
 *
 * Defensive: any missing, malformed, or unrecognized string returns
 * `null` rather than throwing; callers treat `null` as "no Hebrew date".
 * @param {string|null|undefined} value
 * @returns {{ day: number, month: number, leapOrigin: boolean }|null}
 */
export function parseHebrewDateString(value) {
  if (!value || typeof value !== 'string') return null

  const match = value.trim().match(/^(\d{1,2})\s+(.+)$/)
  if (!match) return null

  const day = Number(match[1])
  if (!Number.isInteger(day) || day < 1 || day > 30) return null

  const monthName = match[2].trim().toLowerCase()
  const monthEntry = HEBREW_MONTHS.find((m) => m.wireName.toLowerCase() === monthName)
  if (!monthEntry) return null

  return { day, month: monthEntry.month, leapOrigin: monthEntry.leapOrigin }
}

/**
 * Formats a day + a HEBREW_MONTHS entry into the "{day} {month}" wire
 * string stored in the HebrewDate column, e.g. "21 Nisan".
 * @param {number} day
 * @param {{ wireName: string }} monthEntry
 */
export function formatHebrewDateString(day, monthEntry) {
  return `${day} ${monthEntry.wireName}`
}

// --- Gregorian dd/mm/yyyy input ---------------------------------------
//
// The form takes a typed, mask-formatted dd/mm/yyyy string (not a native
// <input type="date">, whose picker is awkward for a 40-year-old birth
// year on a phone). Persistence stays ISO `yyyy-mm-dd`, which is what
// rows already in the sheet use - the dd/mm/yyyy shape never leaves the
// UI layer.

function isGregorianLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Number of days in a given Gregorian (year, month) - month is 1-12. */
function daysInGregorianMonth(year, month) {
  if (month === 2) return isGregorianLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/**
 * Re-formats whatever the user typed into a dd/mm/yyyy mask: every
 * non-digit is dropped and the separators are re-inserted at fixed
 * positions. Deliberately emits no trailing "/" (i.e. "12", not "12/"),
 * so backspacing never fights the mask by re-adding the separator the
 * user just deleted.
 * @param {string} raw
 */
export function formatGregorianInput(raw) {
  const digits = String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 8)

  const parts = []
  if (digits.length > 0) parts.push(digits.slice(0, 2))
  if (digits.length > 2) parts.push(digits.slice(2, 4))
  if (digits.length > 4) parts.push(digits.slice(4, 8))
  return parts.join('/')
}

/**
 * Parses a complete dd/mm/yyyy string into a local Date, rejecting dates
 * that merely *look* right but don't exist on the calendar (31/02/1990,
 * 29/02 in a common year, month 13, day 0).
 * @param {string} value
 * @returns {Date|null}
 */
export function parseGregorianInput(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? '').trim())
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])

  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInGregorianMonth(year, month)) return null

  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Validates the typed birth date, returning the specific reason it was
 * rejected so the form can say what's actually wrong instead of a generic
 * "invalid date".
 * @param {string} value dd/mm/yyyy (possibly partial)
 * @param {Date} [today]
 * @returns {{ ok: boolean, error: string|null, date?: Date }}
 */
export function validateGregorianInput(value, today = new Date()) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return { ok: false, error: 'יש להזין תאריך לועזי' }

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return { ok: false, error: 'יש להשלים תאריך מלא בפורמט dd/mm/yyyy' }
  }

  const maxYear = today.getFullYear()
  const year = Number(trimmed.slice(6, 10))
  if (year < MIN_BIRTH_YEAR || year > maxYear) {
    return { ok: false, error: `השנה חייבת להיות בין ${MIN_BIRTH_YEAR} ל־${maxYear}` }
  }

  const date = parseGregorianInput(trimmed)
  if (!date) return { ok: false, error: 'התאריך לא קיים בלוח השנה' }

  if (date > startOfDay(today)) return { ok: false, error: 'לא ניתן להזין תאריך עתידי' }

  return { ok: true, error: null, date }
}

/** Formats a Date as the ISO `yyyy-mm-dd` string stored in the sheet. */
export function toIsoDateString(date) {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Reads a stored GregorianDate back into a local Date.
 *
 * Tolerant of both shapes the column can realistically hold: the ISO
 * `yyyy-mm-dd` this app writes (optionally with a time part, which is
 * what a real Sheets date cell serializes to), and a hand-entered
 * dd/mm/yyyy. The ISO branch builds the Date from its parts rather than
 * handing the string to `new Date()`, because `new Date('1990-05-14')`
 * is parsed as UTC midnight and would land on the 13th for anyone west
 * of Greenwich.
 * @param {string|null|undefined} value
 * @returns {Date|null}
 */
export function parseStoredGregorianDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string') return null

  const trimmed = value.trim()

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
  if (iso) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    const day = Number(iso[3])
    if (month < 1 || month > 12) return null
    if (day < 1 || day > daysInGregorianMonth(year, month)) return null
    return new Date(year, month - 1, day)
  }

  return parseGregorianInput(trimmed)
}

/** Truncates a Date to local midnight (strips time-of-day). */
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Whole-day difference between two dates, computed via UTC day numbers so
 * DST transitions never introduce an off-by-one error.
 * @returns {number} days from `from` to `to` (positive if `to` is later)
 */
function daysBetween(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / 86400000)
}

/**
 * Builds a Gregorian Date for (year, month, day), substituting Feb 29 with
 * Feb 28 in non-leap years.
 *
 * Design decision (documented per qa.md's leap-year edge case): a Feb 29
 * birthday is observed on Feb 28 in common years, not postponed to Mar 1.
 * This mirrors the most common real-world convention for "leapling"
 * birthdays and keeps behavior deterministic and testable.
 */
function makeGregorianDateSafe(year, month, day) {
  const safeDay = month === 2 && day === 29 && !isGregorianLeapYear(year) ? 28 : day
  return new Date(year, month - 1, safeDay)
}

/**
 * Next Gregorian occurrence of (month, day) on or after `today`.
 * @returns {{ date: Date, ageTurning: number|null }}
 */
function nextGregorianOccurrence({ month, day, birthYear }, today) {
  const todayMidnight = startOfDay(today)
  let year = today.getFullYear()
  let candidate = makeGregorianDateSafe(year, month, day)
  if (candidate < todayMidnight) {
    year += 1
    candidate = makeGregorianDateSafe(year, month, day)
  }
  const ageTurning = Number.isFinite(birthYear) ? year - birthYear : null
  return { date: candidate, ageTurning }
}

/** Looks up the Hebrew numeral label for a day 1-30 (e.g. 18 -> 'י״ח'). */
function hebrewDayLabel(day) {
  return HEBREW_DAYS.find((d) => d.value === day)?.label ?? String(day)
}

/**
 * Looks up the Hebrew-script month label matching a (month, isLeapYear)
 * pair - the same `${month}:${leapOrigin}` id scheme used by the
 * HEBREW_MONTHS picker in constants.js, so the label shown for a
 * *computed* occurrence (e.g. "this lands in Adar I because the target
 * year is a leap year") always matches one of the picker's own options.
 * Falls back to any same-month entry if no exact leap-shape match
 * exists, so an Adar month never renders as an empty string. Exported
 * for reuse by Header.jsx, which renders today's Hebrew month the same
 * way.
 */
export function hebrewMonthLabel(month, isLeapYear) {
  const exact = HEBREW_MONTHS.find((m) => m.month === month && m.leapOrigin === isLeapYear)
  if (exact) return exact.label
  return HEBREW_MONTHS.find((m) => m.month === month)?.label ?? ''
}

/** Formats a Hebrew date the conventional way, e.g. "י״ח באייר". */
function formatHebrewLabel(day, month, isLeapYear) {
  return `${hebrewDayLabel(day)} ב${hebrewMonthLabel(month, isLeapYear)}`
}

/** Short Gregorian label for the feed, e.g. "14 במאי". */
function formatGregorianLabel(date) {
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}

/**
 * Next Hebrew-calendar occurrence of (hebrewMonth, hebrewDay) on or after
 * `today`, converted to a Gregorian Date.
 *
 * `leapOrigin` must be supplied explicitly by the caller, derived from
 * parsing the HebrewDate wire string - "אדר א׳" vs "אדר" vs "אדר ב׳" are
 * three distinct month names precisely so this never has to be inferred.
 *
 * `birthHebrewYear` comes from converting the (now mandatory) Gregorian
 * birth date, so Hebrew-dated people finally get an "age turning" too -
 * counted in elapsed *Hebrew* years, which is the right unit for a
 * Hebrew birthday.
 *
 * @returns {{ date: Date, hebrewLabel: string, ageTurning: number|null }}
 */
function nextHebrewOccurrence({ month, day, leapOrigin, birthHebrewYear }, today) {
  const todayMidnight = startOfDay(today)
  // A reference Hebrew year whose leap/non-leap "shape" matches the
  // origin is needed by birthdayOrAnniversary's postponement rules; its
  // specific value is otherwise irrelevant, so two fixed, known years are
  // used instead of searching for one. (5783 is a common year, 5784 a
  // leap year, per @hebcal/hdate's own documented examples.)
  const refYear = leapOrigin ? 5784 : 5783
  const origin = { yy: refYear, mm: month, dd: day }
  const currentHebrewYear = new HDate(today).getFullYear()

  let targetHebrewYear = currentHebrewYear
  let occurrence = birthdayOrAnniversary(targetHebrewYear, origin)
  let gregDate = occurrence.greg()

  if (gregDate < todayMidnight) {
    targetHebrewYear += 1
    occurrence = birthdayOrAnniversary(targetHebrewYear, origin)
    gregDate = occurrence.greg()
  }

  const ageTurning = Number.isFinite(birthHebrewYear) ? targetHebrewYear - birthHebrewYear : null

  return {
    date: gregDate,
    // Render the *actual computed* month/day (which may have postponed
    // to a different month than the one stored, e.g. day-30 Adar I ->
    // Nisan 1), not the original input.
    hebrewLabel: formatHebrewLabel(occurrence.getDate(), occurrence.getMonth(), occurrence.isLeapYear()),
    ageTurning,
  }
}

/** Safe fallback result for a record whose date can't be computed. */
function unsetOccurrence() {
  return {
    gregorian: null,
    hebrew: null,
    next: null,
    daysRemaining: Infinity, // sorts last, never compared with NaN
    dateLabel: UNSET_DATE_LABEL,
    isUnset: true,
  }
}

/**
 * Computes a person's upcoming birthday(s).
 *
 * The Gregorian birth date is mandatory and is the record's anchor: it is
 * the only field carrying a birth year, so it is what makes "age turning"
 * possible, and a record without a usable one is unrenderable (returns
 * `unsetOccurrence()` rather than propagating "Invalid Date" or NaN into
 * the UI).
 *
 * Someone with both dates has genuinely two upcoming birthdays on two
 * different days - the Hebrew one drifts against the Gregorian calendar
 * every year - so both are returned and the card shows both countdowns
 * side by side rather than silently picking a winner:
 *
 *   gregorian - always present. Age counted in Gregorian years.
 *   hebrew    - only when the record has a parseable Hebrew date.
 *               Recomputed for the upcoming Hebrew year through
 *               @hebcal/hdate (postponements included). Age counted in
 *               elapsed *Hebrew* years, the right unit for a Hebrew
 *               birthday, derived by converting the Gregorian birth date
 *               to its Hebrew year - which is why the two ages can
 *               legitimately differ by one.
 *   next      - whichever of the two comes first. Drives the feed's sort
 *               order and the card's visual prominence, so a person
 *               surfaces as soon as *either* birthday approaches.
 *
 * @param {object} person
 * @param {Date} [today]
 */
export function getNextOccurrence(person, today = new Date()) {
  if (!person) return unsetOccurrence()

  const birthDate = parseStoredGregorianDate(person.gregorianDate)
  if (!birthDate) return unsetOccurrence()

  const gregorianNext = nextGregorianOccurrence(
    {
      month: birthDate.getMonth() + 1,
      day: birthDate.getDate(),
      birthYear: birthDate.getFullYear(),
    },
    today,
  )
  const gregorian = {
    calendar: 'gregorian',
    date: gregorianNext.date,
    daysRemaining: daysBetween(today, gregorianNext.date),
    ageTurning: gregorianNext.ageTurning,
    label: formatGregorianLabel(gregorianNext.date),
  }

  let hebrew = null
  const parsedHebrew = parseHebrewDateString(person.hebrewDate)
  if (parsedHebrew) {
    // new HDate(Date) treats the civil date as the Hebrew date that
    // *begins* that morning (i.e. assumes a daytime birth); a birth after
    // sunset technically belongs to the next Hebrew day. Not knowable
    // from a date-only field, so the common case is assumed.
    const birthHebrewYear = new HDate(birthDate).getFullYear()
    const hebrewNext = nextHebrewOccurrence(
      {
        month: parsedHebrew.month,
        day: parsedHebrew.day,
        leapOrigin: parsedHebrew.leapOrigin,
        birthHebrewYear,
      },
      today,
    )
    hebrew = {
      calendar: 'hebrew',
      date: hebrewNext.date,
      daysRemaining: daysBetween(today, hebrewNext.date),
      ageTurning: hebrewNext.ageTurning,
      label: hebrewNext.hebrewLabel,
    }
  }

  const next = hebrew && hebrew.daysRemaining < gregorian.daysRemaining ? hebrew : gregorian

  return {
    gregorian,
    hebrew,
    next,
    daysRemaining: next.daysRemaining,
    dateLabel: next.label,
    isUnset: false,
  }
}

/**
 * Sorts people by days remaining until their next birthday (ascending).
 * Records with no usable date (`isUnset`) carry `daysRemaining: Infinity`
 * and sort last. Ties broken alphabetically by name for stable,
 * predictable ordering.
 */
export function sortByUpcoming(peopleWithOccurrence) {
  return [...peopleWithOccurrence].sort((a, b) => {
    if (a.daysRemaining !== b.daysRemaining) return a.daysRemaining - b.daysRemaining
    return a.name.localeCompare(b.name)
  })
}

export { isGregorianLeapYear, daysInGregorianMonth, daysBetween, startOfDay }
