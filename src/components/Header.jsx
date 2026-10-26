import { useMemo } from 'react'
import { HDate, gematriya } from '@hebcal/hdate'
import { hebrewMonthLabel, hebrewYearLabel } from '../utils/dateUtils'
import Wordmark from './Wordmark'

/**
 * Header, in two rows:
 *   - Brand row: the מוֹלָד wordmark (right) and the PIN-reset control
 *     (left), which sort themselves that way automatically in an RTL
 *     flex row.
 *   - Date row: both of today's dates together on one line - the Hebrew
 *     date carrying the weight, then the Gregorian one, separated by a
 *     dot. They belong to each other, so they read as one statement
 *     instead of being split across the header the way they were before.
 *     The row wraps rather than overflowing on a narrow screen.
 *
 * The brand name is the h1 rather than the date - the date changes every
 * day and isn't the document's title.
 *
 * Stickiness, the background blur and the bottom border live on App's
 * wrapper rather than here, because the view switcher and the search
 * field have to stick along with this: three separately-sticky elements
 * would need their offsets kept in sync by hand, while one sticky
 * container just works at any height.
 */
export default function Header({ onResetPin }) {
  const { hebrewLine, gregorianLine } = useMemo(() => {
    const today = new Date()
    const hd = new HDate(today)

    const weekday = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(today)
    const dayLabel = gematriya(hd.getDate())
    const monthLabel = hebrewMonthLabel(hd.getMonth(), hd.isLeapYear())
    const yearLabel = hebrewYearLabel(hd.getFullYear())

    // The Gregorian half needs no Hebrew-calendar math at all: he-IL's
    // own Intl data already spells Gregorian month names in Hebrew
    // ("באוקטובר"), which is all this side is asking for.
    const gregorianLine = today.toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    return {
      hebrewLine: `${weekday}, ${dayLabel} ${monthLabel} ${yearLabel}`,
      gregorianLine,
    }
  }, [])

  // Confirm first: this sits one tap away in the header, and an
  // accidental hit would drop the stored PIN and bounce the user back to
  // the gate mid-scroll.
  function handleResetPin() {
    if (window.confirm('להחליף את קוד הנעילה? תתבקש להזין קוד מחדש.')) {
      onResetPin()
    }
  }

  return (
    <header dir="rtl" className="px-5 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <div className="flex items-center justify-between gap-3">
        <h1>
          <Wordmark variant="name" nameClassName="text-lg font-semibold text-navy" />
        </h1>
        <button
          type="button"
          onClick={handleResetPin}
          aria-label="החלפת קוד נעילה"
          title="החלפת קוד נעילה"
          className="-me-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors active:bg-cream-deep active:text-navy"
        >
          <UnlockIcon className="h-5 w-5" />
        </button>
      </div>

      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-medium text-navy-soft">{hebrewLine}</span>
        <span aria-hidden="true" className="text-line-strong">
          ·
        </span>
        <span className="text-xs text-muted">{gregorianLine}</span>
      </p>
    </header>
  )
}

/**
 * Open padlock: the shackle's right leg floats clear of the body, which
 * is the conventional way to draw "unlock" as opposed to "locked".
 * Inline SVG so it inherits the header's color and renders identically
 * across browsers.
 */
function UnlockIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="4.5" y="10.8" width="15" height="10.2" rx="2.6" />
      <path d="M8.4 10.8V7.6a4 4 0 0 1 7.1-.8" />
      <circle cx="12" cy="15.3" r="1.4" />
      <path d="M12 16.7v1.6" />
    </svg>
  )
}


