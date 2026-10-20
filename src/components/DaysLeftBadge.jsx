const CALENDAR_LABEL = {
  gregorian: 'לועזי',
  hebrew: 'עברי',
}

/**
 * Highly visible "days left" indicator. Prominence fades with distance,
 * per spec/ui.md: today is solid gold, the next week keeps a gold tint,
 * and anything past a month settles into quiet paper tones.
 *
 * `calendar` tags the badge with which calendar it is counting down -
 * passed only when a person actually has two upcoming birthdays, so a
 * single-date record isn't labelled with a distinction that doesn't
 * apply to it. The tag lives inside the pill rather than beside it so
 * each badge is self-describing wherever it ends up.
 *
 * Gold always carries navy text, never white - white on this gold is only
 * 2.1:1, while navy on it is 5.3:1.
 */
export default function DaysLeftBadge({ daysRemaining, calendar = null }) {
  let label
  let classes

  if (daysRemaining === 0) {
    label = 'היום'
    classes = 'bg-gold text-navy-deep font-bold shadow-sm'
  } else if (daysRemaining === 1) {
    label = 'מחר'
    classes = 'bg-gold-light text-navy-deep font-semibold'
  } else if (daysRemaining <= 7) {
    label = `בעוד ${daysRemaining} ימים`
    classes = 'bg-gold-pale text-navy border border-gold-light'
  } else if (daysRemaining <= 30) {
    label = `בעוד ${daysRemaining} ימים`
    classes = 'bg-cream-deep text-navy border border-line-strong'
  } else {
    label = `בעוד ${daysRemaining} ימים`
    classes = 'bg-cream-deep text-muted border border-line'
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium tabular-nums ${classes}`}
    >
      {calendar && (
        <span className="rounded-full bg-navy/10 px-1.5 py-px text-xs font-semibold text-navy">
          {CALENDAR_LABEL[calendar]}
        </span>
      )}
      <span>{label}</span>
    </span>
  )
}
