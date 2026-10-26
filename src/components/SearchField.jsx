/**
 * Name search for the list view.
 *
 * `type="search"` rather than `type="text"`: on iOS it puts a "search"
 * key on the keyboard instead of "return", and it is what the platform
 * uses to decide the field deserves a clear affordance. The native clear
 * button is suppressed (`appearance-none` plus the WebKit pseudo-element
 * rule in index.css) in favour of the one drawn here, which is a 44px
 * tap target and sits on the correct side in RTL - the native one is
 * ~14px and mis-positions in right-to-left layouts.
 *
 * Wrapped in a <form> with onSubmit prevented so that pressing the
 * search key on a phone keyboard dismisses the keyboard instead of
 * reloading the page. Filtering itself is live on every keystroke; there
 * is nothing to submit.
 */
export default function SearchField({ value, onChange, resultCount }) {
  return (
    <form
      role="search"
      onSubmit={(event) => event.preventDefault()}
      className="relative flex items-center"
    >
      <label htmlFor="person-search" className="sr-only">
        חיפוש לפי שם
      </label>

      <SearchIcon className="pointer-events-none absolute start-3.5 h-4 w-4 text-muted" />

      <input
        id="person-search"
        type="search"
        inputMode="search"
        autoComplete="off"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="חיפוש לפי שם"
        aria-describedby={value ? 'person-search-count' : undefined}
        className="min-h-11 w-full appearance-none rounded-full border border-line bg-surface ps-10 pe-11 text-navy placeholder:text-muted focus:border-gold-light focus:outline-none focus:ring-2 focus:ring-gold"
      />

      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="ניקוי החיפוש"
          className="absolute end-1 flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-cream-deep active:text-navy"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}

      {/* Announced, not drawn: the visible result count would duplicate
          the list the user is already looking at, but a screen-reader
          user needs to hear that the list changed under them. */}
      {value && (
        <span id="person-search-count" aria-live="polite" className="sr-only">
          {resultCount === 0 ? 'אין תוצאות' : `${resultCount} תוצאות`}
        </span>
      )}
    </form>
  )
}

function SearchIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  )
}
