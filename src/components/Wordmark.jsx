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
          /* The artwork is already drawn as a tile with its own rounded
             corners, and its background is opaque white, so this trims
             the flat corners that would otherwise show as a pale square
             against the cream UI. 16% is the largest radius that still
             removes background only: measured against icon-192, nothing
             it clips deviates from the background by more than 4/255,
             while the previous 22% cut into the tile's gold edges. */
          className="shrink-0 rounded-[16%]"
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
