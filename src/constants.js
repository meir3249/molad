import { gematriya } from '@hebcal/hdate'

// Placeholder Google Apps Script Web App URL.
// Replace with your deployed Apps Script /exec URL when ready.
// Until this is set to a real https://script.google.com/... URL, the app
// transparently persists data to localStorage instead (see services/api.js)
// so the app is fully usable on its own.
export const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwYMAHVkXxhmZxiBU03AwuS3rlkjp5c6_NQMFCyymzB4r1wOwsqNqjI7Ua1JYAr2Ik/exec'

export const PIN_STORAGE_KEY = 'birthday_app_pin'
export const PEOPLE_STORAGE_KEY = 'birthday_app_people'

// Form field limits. Enforced in the UI (maxLength + validation) and
// surfaced to the user as a live character counter on the notes field, so
// a value is never silently truncated on its way to the sheet.
export const NAME_MIN_LENGTH = 2
export const NAME_MAX_LENGTH = 40
export const NOTES_MAX_LENGTH = 80

// Hebrew month picker options, in the civil-year order requested
// (Tishrei first). `month` is the real @hebcal/hdate month number
// (NISAN=1 ... ADAR_II=13) - this is what actually drives the date math
// in utils/dateUtils.js, completely independent of the display order
// below.
//
// `wireName` is the English name stored in the HebrewDate column (e.g.
// "21 Nisan", "14 Adar II" - see utils/dateUtils.js's
// formatHebrewDateString/parseHebrewDateString). These are the same
// transliterations @hebcal/hdate's own MonthName type uses, so they stay
// consistent with anything else in the app that renders a month name in
// English.
//
// "Adar I", "Adar II" and plain "Adar" are listed as three separate
// options (matching the spec) because they mean three different things:
//   - "אדר א׳" (Adar I): month 12, born in a leap year's first Adar.
//   - "אדר ב׳" (Adar II): month 13, born in a leap year's second Adar
//     (only exists in a leap year).
//   - "אדר" (plain Adar): month 12, born in an ordinary (non-leap) year's
//     only Adar.
// Adar I and plain Adar share the same month number (12) but need
// different `leapOrigin` flags, since that flag changes how a day-30
// birthday postpones when the target year's shape differs from the
// origin year's. Because "Adar I" / "Adar II" / "Adar" are three distinct
// wireNames, the wire string alone fully disambiguates all three cases -
// no separate leapOrigin flag needs to travel over the wire.
//
// `id` is `${month}:${leapOrigin}`, unique across all 14 entries and
// safe to use as a <select> value.
export const HEBREW_MONTHS = [
  { id: '7:false', label: 'תשרי', month: 7, leapOrigin: false, wireName: 'Tishrei' },
  { id: '8:false', label: 'חשוון', month: 8, leapOrigin: false, wireName: 'Cheshvan' },
  { id: '9:false', label: 'כסלו', month: 9, leapOrigin: false, wireName: 'Kislev' },
  { id: '10:false', label: 'טבת', month: 10, leapOrigin: false, wireName: 'Tevet' },
  { id: '11:false', label: 'שבט', month: 11, leapOrigin: false, wireName: "Sh'vat" },
  { id: '12:true', label: 'אדר א׳', month: 12, leapOrigin: true, wireName: 'Adar I' },
  { id: '13:true', label: 'אדר ב׳', month: 13, leapOrigin: true, wireName: 'Adar II' },
  { id: '12:false', label: 'אדר', month: 12, leapOrigin: false, wireName: 'Adar' },
  { id: '1:false', label: 'ניסן', month: 1, leapOrigin: false, wireName: 'Nisan' },
  { id: '2:false', label: 'אייר', month: 2, leapOrigin: false, wireName: 'Iyyar' },
  { id: '3:false', label: 'סיוון', month: 3, leapOrigin: false, wireName: 'Sivan' },
  { id: '4:false', label: 'תמוז', month: 4, leapOrigin: false, wireName: 'Tamuz' },
  { id: '5:false', label: 'אב', month: 5, leapOrigin: false, wireName: 'Av' },
  { id: '6:false', label: 'אלול', month: 6, leapOrigin: false, wireName: 'Elul' },
]

// Days 1-30 of a Hebrew month, labeled with proper Hebrew numerals via
// @hebcal/hdate's gematriya() - which already encodes the standard
// exceptions (ט״ו / ט״ז instead of spelling out God's name for 15/16,
// single geresh for round tens like ל׳ for 30) rather than reimplementing
// that logic here.
export const HEBREW_DAYS = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1
  return { value: day, label: gematriya(day) }
})
