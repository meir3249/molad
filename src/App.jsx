import { useEffect, useState, useCallback, useMemo } from 'react'
import Header from './components/Header'
import BirthdayCard from './components/BirthdayCard'
import FloatingActionButton from './components/FloatingActionButton'
import AddPersonModal from './components/AddPersonModal'
import PinGate from './components/PinGate'
import { fetchBirthdays, createBirthday, AuthError } from './services/api'
import { getNextOccurrence, sortByUpcoming } from './utils/dateUtils'
import { PIN_STORAGE_KEY } from './constants'

export default function App() {
  const [pin, setPin] = useState(() => localStorage.getItem(PIN_STORAGE_KEY))
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')

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

  function handlePinSubmit(enteredPin) {
    localStorage.setItem(PIN_STORAGE_KEY, enteredPin)
    setPin(enteredPin)
  }

  /**
   * Drops the stored PIN and returns to the gate so a different one can
   * be entered - needed whenever the PIN changes on the Apps Script side.
   *
   * The loaded records are cleared along with it: they were fetched under
   * the old PIN, and leaving them in state would flash someone else's
   * data behind the next gate. This is a client-side reset only; the PIN
   * is still enforced server-side on every request (see services/api.js).
   */
  function handleResetPin() {
    localStorage.removeItem(PIN_STORAGE_KEY)
    setPin(null)
    setPeople([])
    setError('')
    setModalOpen(false)
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

      if (result.optimistic) {
        setNotice('הרשומה נשמרה. מסנכרן עם הגיליון…')
        await loadPeople(pin, { silent: true })
        setNotice('')
      }
    } catch (err) {
      if (err instanceof AuthError) {
        localStorage.removeItem(PIN_STORAGE_KEY)
        setPin(null)
      } else {
        setSaveError('השמירה נכשלה. בדוק את החיבור ונסה שוב.')
      }
    } finally {
      setSaving(false)
    }
  }

  function openModal() {
    setSaveError('')
    setModalOpen(true)
  }

  function closeModal() {
    setSaveError('')
    setModalOpen(false)
  }

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


  if (!pin) {
    return <PinGate onSubmit={handlePinSubmit} />
  }

  return (
    <div dir="rtl" className="min-h-screen bg-cream pb-28">
      <Header onResetPin={handleResetPin} />

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

        {!loading && !error && sortedPeople.length === 0 && (
          <p className="py-16 text-center text-muted">
            עוד אין ימי הולדת. הקש על + כדי להוסיף את הראשון.
          </p>
        )}

        {!loading && !error && sortedPeople.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {sortedPeople.map((entry) => (
              <BirthdayCard key={entry.person.id} person={entry.person} occurrence={entry} />
            ))}
          </ul>
        )}
      </main>

      <FloatingActionButton onClick={openModal} />

      <AddPersonModal
        open={modalOpen}
        onClose={closeModal}
        onSave={handleSave}
        saving={saving}
        saveError={saveError}
      />
    </div>
  )
}
