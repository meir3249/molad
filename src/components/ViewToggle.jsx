const VIEWS = [
  { id: 'calendar', label: 'לוח שנה' },
  { id: 'list', label: 'רשימה' },
]

/**
 * Two-segment control for switching between the calendar grid and the
 * list feed.
 *
 * A segmented control rather than a tab bar: there are exactly two
 * views, both show the same data, and neither is a separate "section" of
 * the app - so the iOS segmented idiom (one pill, a sliding selection)
 * says "same thing, different lens", which is the truth, where a bottom
 * tab bar would imply two destinations.
 *
 * Marked up as a radio group, not as buttons. That gives keyboard users
 * arrow-key movement between the two options for free and lets assistive
 * tech announce "1 of 2 selected" rather than reading two unrelated
 * buttons. The inputs are visually hidden but still focusable, with the
 * focus ring drawn on the label via peer-focus-visible.
 */
export default function ViewToggle({ view, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label="תצוגה"
      className="flex gap-1 rounded-full border border-line-strong bg-cream-deep p-1"
    >
      {VIEWS.map((option) => {
        const selected = option.id === view
        return (
          <label
            key={option.id}
            className={`relative flex min-h-9 flex-1 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors ${
              selected ? 'bg-surface text-navy shadow-sm' : 'text-muted active:bg-line'
            }`}
          >
            <input
              type="radio"
              name="view"
              value={option.id}
              checked={selected}
              onChange={() => onChange(option.id)}
              className="peer absolute h-0 w-0 opacity-0"
            />
            <span className="rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-gold peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-cream-deep">
              {option.label}
            </span>
          </label>
        )
      })}
    </div>
  )
}
