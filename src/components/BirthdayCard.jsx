import DaysLeftBadge from './DaysLeftBadge'
import AddToCalendarButtons from './AddToCalendarButtons'

/**
 * A single person's card in the feed.
 *
 * Someone with both a Gregorian and a Hebrew date has two upcoming
 * birthdays on two different days, so the card lists one row per
 * calendar - each pairing the date itself with its own countdown badge,
 * and each badge tagged לועזי / עברי so there's no guessing which number
 * belongs to which calendar. A person with only a Gregorian date gets a
 * single, untagged row.
 *
 * Visual weight follows the *nearer* of the two birthdays (closer =
 * warmer gold tint, far = plain paper), per spec/ui.md's
 * visual-hierarchy requirement.
 *
 * `highlighted` is set when the card was arrived at by tapping a day in
 * the calendar view, which scrolls the list here - a ring makes it
 * obvious which card the tap landed on when the day holds several.
 *
 * Everything shown here comes off the pre-computed `occurrence` object
 * from utils/dateUtils.js - the card does no date math of its own, so
 * the age shown is always the one that occurrence actually counted
 * (Hebrew years for the Hebrew row, Gregorian years for the Gregorian
 * one; they can differ by one).
 */
export default function BirthdayCard({ person, occurrence, highlighted = false }) {
  const { gregorian, hebrew, next, isUnset } = occurrence

  if (isUnset) {
    return (
      <li dir="rtl" className="rounded-2xl border border-line bg-surface/60 px-4 py-3.5">
        <p className="truncate font-semibold text-navy-soft">{person.name}</p>
        <p className="mt-1 text-sm text-danger">{occurrence.dateLabel}</p>
      </li>
    )
  }

  const isSoon = next.daysRemaining <= 7
  const isFar = next.daysRemaining > 30
  const hasBoth = Boolean(hebrew)

  return (
    <li
      dir="rtl"
      className={`scroll-mt-44 rounded-2xl border px-4 py-3.5 transition-colors ${
        isSoon
          ? 'border-gold-light bg-gold-pale shadow-sm'
          : isFar
            ? 'border-line bg-surface/60'
            : 'border-line bg-surface shadow-sm'
      } ${highlighted ? 'ring-2 ring-gold ring-offset-2 ring-offset-cream' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className={`min-w-0 truncate font-semibold ${isFar ? 'text-navy-soft' : 'text-navy'}`}>
          {person.name}
        </p>
        {next.ageTurning !== null && (
          <p className="flex shrink-0 items-center gap-1.5 text-sm text-muted">
            <CakeIcon className="h-4 w-4 text-gold" />
            <span>חוגג/ת {next.ageTurning}</span>
          </p>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-1.5">
        <OccurrenceRow occurrence={gregorian} tagged={hasBoth} />
        {hebrew && <OccurrenceRow occurrence={hebrew} tagged />}
      </div>

      {person.notes && <p className="mt-2 truncate text-xs text-muted">{person.notes}</p>}

      <AddToCalendarButtons person={person} hasHebrew={hasBoth} />
    </li>
  )
}

function OccurrenceRow({ occurrence, tagged }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="min-w-0 truncate text-sm text-muted">{occurrence.label}</span>
      <DaysLeftBadge
        daysRemaining={occurrence.daysRemaining}
        calendar={tagged ? occurrence.calendar : null}
      />
    </div>
  )
}

/**
 * Birthday cake, drawn inline as SVG paths rather than using the 🎂
 * emoji. An emoji would render as a different picture in every
 * browser/OS pairing (and as a flat monochrome glyph in some), can't
 * inherit the theme's gold, and occasionally falls back to a tofu box;
 * inline SVG paths render identically in Chrome, Safari, Edge and
 * Firefox and scale with the surrounding text.
 */
function CakeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      {/* candle flame */}
      <path d="M12 2.2c-.95.86-1.45 1.55-1.45 2.3a1.45 1.45 0 0 0 2.9 0c0-.75-.5-1.44-1.45-2.3Z" />
      {/* candle */}
      <rect x="11.3" y="5.3" width="1.4" height="3.4" rx=".7" />
      {/* upper tier */}
      <path d="M7.5 8.7h9a3.5 3.5 0 0 1 3.5 3.5v2.3H4v-2.3A3.5 3.5 0 0 1 7.5 8.7Z" />
      {/* lower tier */}
      <path d="M4 16.1h16v2.4A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-2.4Z" />
    </svg>
  )
}
