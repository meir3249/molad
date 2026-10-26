// Device detection, kept in one place because it is the kind of code
// that quietly multiplies into five slightly-different copies otherwise.
//
// Everything here is User-Agent sniffing, which is normally the wrong
// tool - a feature test says what a browser can *do*, while a UA string
// says only what it claims to *be*, and it can be spoofed or changed by
// the user. It is used anyway for exactly one decision (see
// utils/icsUtils.js: hand an .ics to the share sheet or download it)
// because that decision isn't about a capability at all. Both browsers
// support both paths; what differs is which one actually lands the file
// in the user's calendar, and that's a property of the platform's file
// handling rather than of any API the page can probe.

/** True in a browser; false under SSR or a bare Node script. */
function hasNavigator() {
  return typeof navigator !== 'undefined' && navigator !== null
}

/**
 * True on iPhone, iPad and iPod touch - including iPadOS 13+ in its
 * default "desktop" mode, and including Chrome / Firefox / Edge on iOS.
 *
 * Two tests, because one is not enough:
 *
 *   iPhone / iPad / iPod in the UA
 *     Catches iPhone and iPod always, and iPad on iOS 12 and earlier or
 *     when "Request Mobile Website" is on. Also catches every
 *     third-party iOS browser: they are all WebKit wrappers and keep
 *     the device token, merely adding their own (CriOS, FxiOS, EdgiOS).
 *
 *   Macintosh in the UA *and* more than one touch point
 *     iPadOS 13 and later identify as "Macintosh" by default, which is
 *     indistinguishable from a desktop Safari on the UA alone. The touch
 *     count breaks the tie: macOS reports `maxTouchPoints` as 0, since
 *     Apple has never shipped a touchscreen Mac, while an iPad reports
 *     5. `> 1` rather than `> 0` leaves room for a Mac with a stylus or
 *     a touch-capable external display.
 *
 * Deliberately *not* matched: macOS Safari. It shares WebKit and much of
 * the UA with iOS but handles downloads like any desktop browser, so it
 * belongs on the download path.
 */
export function isIosDevice() {
  if (!hasNavigator()) return false

  const ua = navigator.userAgent ?? ''
  if (/iPhone|iPad|iPod/i.test(ua)) return true

  return /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1
}
