/**
 * FAB for adding a new person, pinned above the home-indicator inset.
 * Gold fill with a navy glyph, matching the logo's pairing (and the only
 * contrast-safe direction for text/icons on this gold).
 */
export default function FloatingActionButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="הוספת יום הולדת"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] left-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-navy-deep shadow-lg shadow-gold/40 transition-all active:scale-95 active:bg-gold-light"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        aria-hidden="true"
        className="h-6 w-6"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  )
}
