import { useEffect, useRef, useState } from 'react'
import { buildBirthdayIcs, deliverIcsFile } from '../utils/icsUtils'
import { isIosDevice } from '../utils/platform'

/** How long the "✓ נוסף" confirmation stays up before reverting. */
const CONFIRM_MS = 2600

/**
 * The card's calendar-export control.
 *
 * Exporting an `.ics` rather than asking for notification permission is
 * a deliberate trade: the file is handed to the device once and from
 * then on the OS owns the reminder, so it fires whether or not the app
 * has been opened, survives the browser clearing its storage, and shows
 * up alongside everything else in the user's calendar. A web push
 * subscription would do none of that on iOS.
 *
 * A person with a Hebrew date gets two buttons rather than a single
 * combined file, because the two are not variations on one event - they
 * fall on different days and recur differently (see utils/icsUtils.js).
 * Offering them separately lets the user keep whichever calendar they
 * actually celebrate by, instead of being handed both and having to
 * delete one.
 *
 * `deliverIcsFile` is called straight out of the click handler with
 * nothing awaited first, so the browser still counts the page as
 * user-activated - `navigator.share`, which is the iOS path, refuses
 * without it.
 */
export default function AddToCalendarButtons({ person, hasHebrew }) {
  // null | { calendar, state: 'done' | 'error' }
  const [feedback, setFeedback] = useState(null)
  const timerRef = useRef(null)

  // deliverIcsFile opens the share sheet on iOS and downloads everywhere
  // else, so the accessible names say which one is about to happen
  // rather than promising a download that won't occur. The visible
  // labels stay verb-free ("לועזי" / "עברי" / "הוספה") and read off the
  // row's own "הוספה ליומן" heading, which is true on both paths.
  const actionLabel = isIosDevice() ? 'הוספת' : 'הורדת'

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function flash(calendar, state) {
    clearTimeout(timerRef.current)
    setFeedback({ calendar, state })
    timerRef.current = setTimeout(() => setFeedback(null), CONFIRM_MS)
  }

  async function handleExport(calendar) {
    const file = buildBirthdayIcs(person, calendar)
    if (!file) {
      flash(calendar, 'error')
      return
    }

    try {
      const outcome = await deliverIcsFile(file)
      if (outcome !== 'cancelled') flash(calendar, 'done')
      else setFeedback(null)
    } catch {
      flash(calendar, 'error')
    }
  }

  const stateOf = (calendar) => (feedback?.calendar === calendar ? feedback.state : null)

  return (
    <div className="mt-3 flex items-center gap-2 border-t border-line/80 pt-2.5">
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
        <CalendarPlusIcon className="h-4 w-4" />
        <span>הוספה ליומן</span>
      </span>

      <div className="ms-auto flex shrink-0 gap-1.5">
        {hasHebrew ? (
          <>
            <ExportButton
              state={stateOf('gregorian')}
              onClick={() => handleExport('gregorian')}
              ariaLabel={`${actionLabel} תזכורת ליומן ליום ההולדת הלועזי של ${person.name}`}
            >
              לועזי
            </ExportButton>
            <ExportButton
              state={stateOf('hebrew')}
              onClick={() => handleExport('hebrew')}
              ariaLabel={`${actionLabel} תזכורת ליומן ליום ההולדת העברי של ${person.name}`}
            >
              עברי
            </ExportButton>
          </>
        ) : (
          <ExportButton
            state={stateOf('gregorian')}
            onClick={() => handleExport('gregorian')}
            ariaLabel={`${actionLabel} תזכורת ליומן ליום ההולדת של ${person.name}`}
          >
            הוספה
          </ExportButton>
        )}
      </div>
    </div>
  )
}

/**
 * One export button. The confirmation replaces the label in place rather
 * than appearing next to it, so the row's height never changes and the
 * cards below don't jump when a file is saved.
 *
 * `aria-live="polite"` sits on the label span so the state change is
 * announced; the button's own accessible name stays constant via
 * aria-label, which keeps it findable by voice control even mid-flash.
 */
function ExportButton({ state, onClick, ariaLabel, children }) {
  const label = state === 'done' ? 'נוסף' : state === 'error' ? 'נכשל' : children

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors ${
        state === 'done'
          ? 'border-gold-light bg-gold-pale text-navy'
          : state === 'error'
            ? 'border-danger/40 bg-danger-pale text-danger'
            : 'border-line-strong bg-surface text-navy-soft active:bg-gold-pale'
      }`}
    >
      {state === 'done' && <CheckIcon className="h-3.5 w-3.5" />}
      <span aria-live="polite">{label}</span>
    </button>
  )
}

/** Calendar page with a plus in it - "add to calendar", drawn inline. */
function CalendarPlusIcon({ className }) {
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
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4M12 13v4.5M9.75 15.25h4.5" />
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  )
}
