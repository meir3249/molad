import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Header from './components/Header'
import BirthdayCard from './components/BirthdayCard'
import CalendarView from './components/CalendarView'
import ViewToggle from './components/ViewToggle'
import SearchField from './components/SearchField'
import FloatingActionButton from './components/FloatingActionButton'
import AddPersonModal from './components/AddPersonModal'
import PinGate from './components/PinGate'
import { fetchBirthdays, fetchIsAdmin, createBirthday, AuthError } from './services/api'
import { getNextOccurrence, getOccurrencesOn, sortByUpcoming } from './utils/dateUtils'
import { matchesNameQuery } from './utils/textUtils'
import { PIN_STORAGE_KEY, ADMIN_STORAGE_KEY } from './constants'

/**
 * Reads the cached per-session admin answer.
 *
 * Returns `null` for "not asked yet this session", which is deliberately
 * distinct from `false`: until the backend has answered, the UI renders
 * as read-only, so the add affordances never flash into view and back
 * out again for a family-PIN user on a slow connection. See
 * constants.js (ADMIN_STORAGE_KEY) for why this is sessionStorage and
 * why it is only ever a UI hint.
 */
function readCachedAdmin() {
  try {
    const raw = sessionStorage.getItem(ADMIN_STORAGE_KEY)
    return raw === null ? null : raw === 'true'
  } catch {
    // Private-mode Safari can throw on sessionStorage access; falling
    // back to "ask again" costs one extra cheap request.
    return null
  }
}

function writeCachedAdmin(isAdmin) {
  try {
    sessionStorage.setItem(ADMIN_STORAGE_KEY, String(isAdmin))
  } catch {
    // Non-fatal: the role just gets re-fetched on the next load.
  }
}

function clearCachedAdmin() {
  try {
    sessionStorage.removeItem(ADMIN_STORAGE_KEY)
  } catch {
    // Non-fatal.
  }
}

export default function App() {
  const [pin, setPin] = useState(() => localStorage.getItem(PIN_STORAGE_KEY))
  const [isAdmin, setIsAdmin] = useState(readCachedAdmin)
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  // Bumped on every open so AddPersonModal remounts and re-seeds its
  // form from `pendingDate` on its first render.
  const [modalKey, setModalKey] = useState(0)
  const [pendingDate, setPendingDate] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')

  // The calendar grid is the landing view: "what's coming up this month"
  // is the question the app exists to answer, and it answers it without
  // the user having to read a sorted list to find out.
  const [view, setView] = useState('calendar')
  const [query, setQuery] = useState('')
  // Set when a day was tapped in the grid: the list then shows only that
  // day's people, with a dismissible chip naming the date.
  const [focusedDay, setFocusedDay] = useState(null)
  const listRef = useRef(null)

  /**
   * `silent` reloads in place: no spinner, no clearing of the list, no
   * load-error banner. Used by the post-save reconciliation, where the
   * user has already been told the record is saved and a flash of "טוען…"
   * over the feed would read like something went wrong.
   */
  const loadPeople = useCallback(async (activePin, { silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const data = await fetchBirthdays(activePin)
      setPeople(data)
    } catch (err) {
      if (err instanceof AuthError) {
        // PIN was rejected by the backend: clear it and re-prompt.
        localStorage.removeItem(PIN_STORAGE_KEY)
        clearCachedAdmin()
        setIsAdmin(null)
        setPin(null)
      } else if (!silent) {
        setError('לא הצלחנו לטעון את ימי ההולדת. נסה לרענן את הדף.')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (pin) loadPeople(pin)
  }, [pin, loadPeople])

  /**
   * Resolves the user's role once per browser session.
   *
   * Skipped entirely when the session cache already holds an answer, so
   * a re-render or a silent refetch doesn't re-ask. A failure other than
   * a rejected PIN leaves the role as read-only *without* caching that
   * result - a network blip shouldn't lock an admin out of the add
   * button for the rest of the session, so the next load tries again.
   */
  useEffect(() => {
    if (!pin) return
    if (readCachedAdmin() !== null) return

    let cancelled = false
    ;(async () => {
      try {
        const admin = await fetchIsAdmin(pin)
        if (cancelled) return
        writeCachedAdmin(admin)
        setIsAdmin(admin)
      } catch (err) {
        if (cancelled) return
        if (err instanceof AuthError) {
          localStorage.removeItem(PIN_STORAGE_KEY)
          clearCachedAdmin()
          setIsAdmin(null)
          setPin(null)
        } else {
          setIsAdmin(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pin])

  function handlePinSubmit(enteredPin) {
    localStorage.setItem(PIN_STORAGE_KEY, enteredPin)
    // A different PIN may well mean a different role, so the cached
    // answer from this session is discarded rather than reused.
    clearCachedAdmin()
    setIsAdmin(null)
    setPin(enteredPin)
  }

  /**
   * Drops the stored PIN and returns to the gate so a different one can
   * be entered - needed whenever the PIN changes on the Apps Script side.
   *
   * The loaded records are cleared along with it: they were fetched under
   * the old PIN, and leaving them in state would flash someone else's
   * data behind the next gate. The cached role goes too, for the same
   * reason. This is a client-side reset only; the PIN is still enforced
   * server-side on every request (see services/api.js).
   */
  function handleResetPin() {
    localStorage.removeItem(PIN_STORAGE_KEY)
    clearCachedAdmin()
    setPin(null)
    setIsAdmin(null)
    setPeople([])
    setError('')
    setModalOpen(false)
    setQuery('')
    setFocusedDay(null)
    setView('calendar')
  }

  /**
   * Saves a new person.
   *
   * createBirthday resolves for any write that landed - including the
   * multi-account case where Google's echo redirect 404s after the row
   * was already appended, which it detects by going and looking in the
   * sheet (see services/api.js). So the only job here is to distinguish
   * "confirmed" from "written but unconfirmed":
   *
   *   verified   trust the result. If verification fetched the whole
   *              list, use it - it carries real server-assigned ids
   *              rather than a locally minted one.
   *   optimistic close the modal anyway, say so plainly, and reconcile
   *              with a silent background re-fetch. If the row really
   *              isn't there, that re-fetch removes it and the feed shows
   *              the truth - without ever having blocked the user.
   *
   * A thrown error here means the write genuinely did not happen, so it
   * is the one case that surfaces as a failure - and it surfaces inside
   * the still-open modal, where the form (and the typed data) actually
   * is.
   */
  async function handleSave(personDraft) {
    setSaving(true)
    setSaveError('')
    setNotice('')
    try {
      const result = await createBirthday(pin, personDraft)

      if (result.people) {
        setPeople(result.people)
      } else {
        // Immediate update, no refetch needed (qa.md CRUD requirement).
        setPeople((prev) => [...prev, result.person])
      }
      setModalOpen(false)
      setPendingDate(null)

      if (result.optimistic) {
        setNotice('הרשומה נשמרה. מסנכרן עם הגיליון…')
        await loadPeople(pin, { silent: true })
        setNotice('')
      }
    } catch (err) {
      if (err instanceof AuthError) {
        localStorage.removeItem(PIN_STORAGE_KEY)
        clearCachedAdmin()
        setIsAdmin(null)
        setPin(null)
      } else {
        setSaveError('השמירה נכשלה. בדוק את החיבור ונסה שוב.')
      }
    } finally {
      setSaving(false)
    }
  }

  /** Opens the add sheet, optionally seeded with a day from the grid. */
  const openModal = useCallback((date = null) => {
    setSaveError('')
    setPendingDate(date)
    setModalKey((key) => key + 1)
    setModalOpen(true)
  }, [])

  function closeModal() {
    setSaveError('')
    setModalOpen(false)
    setPendingDate(null)
  }

  /**
   * A day was tapped in the grid. Switches to the list, filtered to that
   * day, then scrolls the list into view - the cards carry the age,
   * notes and calendar-export controls the 44px grid cell has no room
   * for, so the grid's job ends at "who", and the list answers the rest.
   *
   * A pending name search is cleared, since the two filters would
   * otherwise fight and could leave the user staring at an empty list
   * right after tapping a day that visibly had birthdays on it.
   */
  const handleSelectDay = useCallback((date) => {
    setQuery('')
    setFocusedDay(date)
    setView('list')
  }, [])

  // Deferred to the frame after the view switch so the list actually
  // exists in the DOM by the time we scroll to it.
  useEffect(() => {
    if (view !== 'list' || !focusedDay) return
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [view, focusedDay])

  const focusedPeopleIds = useMemo(() => {
    if (!focusedDay) return null
    return new Set(getOccurrencesOn(people, focusedDay).map((entry) => entry.person.id))
  }, [people, focusedDay])

  /**
   * The feed, sorted by days-remaining and then narrowed by whichever
   * filters are active.
   *
   * Filtering happens after the occurrence math rather than before it so
   * the order a person appears in never depends on who else matched the
   * search - the list is always the same list, just shorter.
   */
  const sortedPeople = useMemo(() => {
    const today = new Date()
    const withOccurrence = people.map((person) => ({
      person,
      occurrence: getNextOccurrence(person, today),
    }))
    return sortByUpcoming(
      withOccurrence.map(({ person, occurrence }) => ({ ...occurrence, name: person.name, person })),
    )
  }, [people])

  const visiblePeople = useMemo(
    () =>
      sortedPeople.filter(
        (entry) =>
          matchesNameQuery(entry.person.name, query) &&
          (!focusedPeopleIds || focusedPeopleIds.has(entry.person.id)),
      ),
    [sortedPeople, query, focusedPeopleIds],
  )

  function handleQueryChange(value) {
    setQuery(value)
    // Typing a name is a different intent from "show me this day";
    // keeping both would silently hide matches outside the focused day.
    if (value) setFocusedDay(null)
  }

  /**
   * Switching views by hand drops any day filter.
   *
   * The filter was set by tapping a grid day, so reaching the list
   * through the toggle instead means the user asked for the list, not
   * for that day - and a filter they didn't just apply would look like
   * missing data.
   */
  function handleViewChange(nextView) {
    setFocusedDay(null)
    setView(nextView)
  }

  if (!pin) {
    return <PinGate onSubmit={handlePinSubmit} />
  }

  const canAdd = isAdmin === true

  return (
    <div dir="rtl" className={`min-h-screen bg-cream ${canAdd ? 'pb-28' : 'pb-10'}`}>
      {/* One sticky container for the header, the view switcher and the
          search field, so their combined height never has to be
          hard-coded as a `top` offset anywhere. */}
      <div className="sticky top-0 z-10 border-b border-line bg-cream/85 backdrop-blur-xl">
        <Header onResetPin={handleResetPin} />

        <div className="flex flex-col gap-2 px-5 pb-2.5 pt-2">
          <ViewToggle view={view} onChange={handleViewChange} />
          {view === 'list' && (
            <SearchField
              value={query}
              onChange={handleQueryChange}
              resultCount={visiblePeople.length}
            />
          )}
        </div>
      </div>

      <main className="px-4 pt-4">
        {notice && (
          <p
            role="status"
            className="mb-3 rounded-2xl border border-gold-light bg-gold-pale px-4 py-2.5 text-center text-sm text-navy"
          >
            {notice}
          </p>
        )}

        {loading && <p className="py-10 text-center text-muted">טוען…</p>}

        {!loading && error && (
          <p role="alert" className="py-10 text-center text-danger">
            {error}
          </p>
        )}

        {!loading && !error && view === 'calendar' && (
          <CalendarView
            people={people}
            isAdmin={canAdd}
            onSelectDay={handleSelectDay}
            onAddOnDay={openModal}
          />
        )}

        {!loading && !error && view === 'list' && (
          <div ref={listRef} className="scroll-mt-40">
            {focusedDay && (
              <FocusChip
                date={focusedDay}
                canAdd={canAdd}
                onClear={() => setFocusedDay(null)}
                onAdd={() => openModal(focusedDay)}
              />
            )}

            {people.length === 0 && (
              <p className="py-16 text-center text-muted">
                {canAdd
                  ? 'עוד אין ימי הולדת. הקש על + כדי להוסיף את הראשון.'
                  : 'עוד אין ימי הולדת להצגה.'}
              </p>
            )}

            {people.length > 0 && visiblePeople.length === 0 && (
              <p className="py-16 text-center text-muted">
                {query ? `לא נמצא אף שם שמתאים ל״${query}״` : 'אין ימי הולדת בתאריך זה'}
              </p>
            )}

            {visiblePeople.length > 0 && (
              <ul className="flex flex-col gap-2.5">
                {visiblePeople.map((entry) => (
                  <BirthdayCard
                    key={entry.person.id}
                    person={entry.person}
                    occurrence={entry}
                    highlighted={Boolean(focusedDay)}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </main>

      {/* The add affordances exist only for an admin. Not merely
          disabled - absent, so a family-PIN user is never shown a
          control that would be rejected. Row-level privacy is still
          enforced in the backend regardless (see services/api.js). */}
      {canAdd && (
        <>
          <FloatingActionButton onClick={() => openModal(null)} />

          <AddPersonModal
            key={modalKey}
            open={modalOpen}
            initialDate={pendingDate}
            onClose={closeModal}
            onSave={handleSave}
            saving={saving}
            saveError={saveError}
          />
        </>
      )}
    </div>
  )
}

/**
 * The "showing one day only" chip above a day-focused list.
 *
 * Exists because the filter is otherwise invisible: without it, tapping
 * a grid day and landing on a one-card list looks indistinguishable from
 * having only one record. The X restores the full feed; the + (admin
 * only) is the way to add a second birthday on a day that already has
 * one, which the grid itself can't offer since a marked day's tap is
 * already spoken for.
 */
function FocusChip({ date, canAdd, onClear, onAdd }) {
  const label = date.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="mb-3 flex items-center gap-2 rounded-2xl border border-gold-light bg-gold-pale px-3 py-2">
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">{label}</p>

      {canAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`הוספת יום הולדת ב${label}`}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-gold bg-surface px-3 text-xs font-semibold text-navy active:bg-gold-light"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            aria-hidden="true"
            className="h-3.5 w-3.5"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          הוספה
        </button>
      )}

      <button
        type="button"
        onClick={onClear}
        aria-label="הצגת כל ימי ההולדת"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy-soft active:bg-gold-light"
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
    </div>
  )
}
