const APP_NAME = 'מוֹלָד'

/**
 * The מוֹלָד brand lockup, in three variants:
 *
 *   "mark"  the icon illustration alone. Use where there's room for it
 *           to read - the artwork already contains the app name, so
 *           pairing it with text would print the name twice.
 *   "name"  the name alone, as live text in the Hebrew serif stack
 *           (--font-serif). Use in tight spots like the sticky header,
 *           where a detailed navy illustration shrunk to ~22px would
 *           just go muddy against the cream background. Live text also
 *           keeps the nikud crisp at any size.
 *   "full"  both, for contexts that have neither constraint.
 *
 * The image is the same generated asset the favicon and the iOS home
 * screen use (see scripts/generate-icons.mjs), served at the small size
 * so the header isn't downloading a 512px illustration.
 */
export default function Wordmark({
  variant = 'full',
  markSize = 24,
  nameClassName = '',
  className = '',
}) {
  const showMark = variant === 'mark' || variant === 'full'
  const showName = variant === 'name' || variant === 'full'

  return (
    <span
      className={`inline-flex ${variant === 'full' ? 'flex-row items-center gap-2' : ''} ${className}`}
    >
      {showMark && (
        <img
          src={markSource(markSize)}
          /* When the mark stands alone it carries the name, so it needs a
             real accessible name; alongside the text it's decorative. */
          alt={showName ? '' : APP_NAME}
          aria-hidden={showName ? true : undefined}
          width={markSize}
          height={markSize}
          style={{ width: markSize, height: markSize }}
          /* The generated icon is a square, fully opaque navy plate with
             the calendar tile drawn on it (see
             scripts/generate-icons.mjs), so without rounding it would
             show up as a hard navy square against the cream UI. 21%
             matches the radius iOS and Android apply to a home-screen
             icon, and sits just outside the tile's own ~18.6% corner
             radius - so it removes the navy wedges without reaching the
             tile's gold rim. */
          className="shrink-0 rounded-[21%]"
        />
      )}
      {showName && <span className={`font-serif tracking-wide ${nameClassName}`}>{APP_NAME}</span>}
    </span>
  )
}

/**
 * Smallest generated size that still covers the requested CSS size on a
 * high-density screen, so a 24px header mark doesn't pull down the 512px
 * illustration.
 *
 * Prefixed with BASE_URL because Vite only rewrites asset URLs it can
 * see in markup; a path built in JS stays literal. With the relative
 * base this project uses for GitHub Pages, a leading-slash '/icon-64.png'
 * would resolve against the domain root and 404 from /<repo>/.
 */
function markSource(markSize) {
  const base = import.meta.env.BASE_URL
  if (markSize <= 32) return `${base}icon-64.png`
  if (markSize <= 128) return `${base}icon-192.png`
  return `${base}icon-512.png`
}
