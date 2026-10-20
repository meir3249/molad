import { useRef, useState } from 'react'
import { HEBREW_MONTHS, NAME_MAX_LENGTH, NAME_MIN_LENGTH, NOTES_MAX_LENGTH } from '../constants'
import HebrewDatePicker from './HebrewDatePicker'
import {
  formatGregorianInput,
  formatHebrewDateString,
  parseGregorianInput,
  toIsoDateString,
  validateGregorianInput,
} from '../utils/dateUtils'

const initialForm = {
  name: '',
  gregorianDate: '', // dd/mm/yyyy as typed; converted to ISO on submit
  includeHebrew: false,
  hebrewDay: null,
  hebrewMonthId: null,
  notes: '',
}

// Order the form is validated and focused in, so a failed submit always
// lands the user on the *first* thing that needs fixing.
const FIELD_ORDER = ['name', 'gregorianDate', 'hebrew', 'notes']

/**
 * Bottom sheet for adding a new person.
 *
 * Data model: the Gregorian birth date is required - it is the only field
 * carrying a birth year, which is what makes "age turning" computable
 * (including for Hebrew birthdays, whose Hebrew birth year is derived
 * from it). A Hebrew date is optional and opt-in behind the "הוסף גם
 * תאריך עברי" toggle; when present it is what the person's countdown
 * follows. There is no "date type" choice anymore - which calendar drives
 * a record is derived from which dates it has (see dateUtils.js).
 *
 * Validation is per-field rather than one shared error line: each field
 * shows its own message underneath itself, on blur and on submit, wired
 * up with aria-invalid/aria-describedby. The save button stays enabled
 * even when the form is invalid - a disabled button tells the user
 * nothing about *why* it won't go through.
 */
export default function AddPersonModal({ open, onClose, onSave, saving, saveError = '' }) {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const fieldRefs = useRef({})

  if (!open) return null

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  /** Clears one field's error as soon as the user edits it. */
  function clearError(field) {
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function handleField(field, value) {
    update(field, value)
    clearError(field)
  }

  function handleBlur(field) {
    const message = validateForm(form)[field]
    setErrors((prev) => ({ ...prev, [field]: message }))
  }

  /**
   * Keeps the dd/mm/yyyy mask in sync with what was typed while leaving
   * the caret where the user expects it: the caret is tracked by how many
   * *digits* precede it, then re-placed after that same digit in the
   * re-formatted string, so inserting a separator doesn't throw the caret
   * to the end of the field.
   */
  function handleGregorianChange(event) {
    const input = event.target
    const selection = input.selectionStart ?? input.value.length
    const digitsBeforeCaret = input.value.slice(0, selection).replace(/\D/g, '').length
    const formatted = formatGregorianInput(input.value)

    handleField('gregorianDate', formatted)
    restoreCaret(input, formatted, digitsBeforeCaret)
  }

  /**
   * Backspacing onto a "/" would otherwise delete only the separator -
   * which the mask immediately puts back, so the keypress appears to do
   * nothing. Deleting the digit *before* the separator instead is what
   * the user meant.
   */
  function handleGregorianKeyDown(event) {
    if (event.key !== 'Backspace') return

    const input = event.target
    const { selectionStart, selectionEnd, value } = input
    if (selectionStart !== selectionEnd || selectionStart === 0) return
    if (value[selectionStart - 1] !== '/') return

    event.preventDefault()
    const head = value.slice(0, selectionStart - 1).replace(/\D/g, '').slice(0, -1)
    const tail = value.slice(selectionStart).replace(/\D/g, '')
    const formatted = formatGregorianInput(head + tail)

    handleField('gregorianDate', formatted)
    restoreCaret(input, formatted, head.length)
  }

  function toggleHebrew(checked) {
    clearError('hebrew')
    setForm((prev) => ({
      ...prev,
      includeHebrew: checked,
      // Drop any partially-picked Hebrew date when the section is closed,
      // so stale values can never ride along on submit.
      hebrewDay: checked ? prev.hebrewDay : null,
      hebrewMonthId: checked ? prev.hebrewMonthId : null,
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    const validationErrors = validateForm(form)
    const firstInvalid = FIELD_ORDER.find((field) => validationErrors[field])
    if (firstInvalid) {
      setErrors(validationErrors)
      const target = fieldRefs.current[firstInvalid]
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      target?.focus({ preventScroll: true })
      return
    }

    const selectedMonth = HEBREW_MONTHS.find((m) => m.id === form.hebrewMonthId)

    onSave({
      name: form.name.trim(),
      gregorianDate: toIsoDateString(parseGregorianInput(form.gregorianDate)),
      hebrewDate:
        form.includeHebrew && selectedMonth
          ? formatHebrewDateString(Number(form.hebrewDay), selectedMonth)
          : null,
      notes: form.notes.trim(),
    })
  }

  function handleClose() {
    setForm(initialForm)
    setErrors({})
    onClose()
  }

  const notesRemaining = NOTES_MAX_LENGTH - form.notes.length

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-navy-deep/40 backdrop-blur-sm"
      onClick={handleClose}
      dir="rtl"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="הוספת יום הולדת"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') handleClose()
        }}
        className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl border-t border-line bg-cream shadow-[0_-8px_40px_rgba(22,41,74,0.18)]"
      >
        <div className="shrink-0 px-5 pt-3">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" />
          <h2 className="mb-1 text-lg font-semibold text-navy">הוספת יום הולדת</h2>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 pt-3">
            <Field id="person-name" label="שם" error={errors.name}>
              <input
                ref={(node) => {
                  fieldRefs.current.name = node
                }}
                id="person-name"
                type="text"
                value={form.name}
                onChange={(event) => handleField('name', event.target.value)}
                onBlur={() => handleBlur('name')}
                maxLength={NAME_MAX_LENGTH}
                autoFocus
                autoComplete="name"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'person-name-error' : undefined}
                className={inputClasses(errors.name)}
                placeholder="שם מלא"
              />
            </Field>

            <Field
              id="person-gregorian"
              label="תאריך לועזי"
              error={errors.gregorianDate}
              hint="חובה - ממנו מחושב הגיל"
            >
              <input
                ref={(node) => {
                  fieldRefs.current.gregorianDate = node
                }}
                id="person-gregorian"
                type="text"
                inputMode="numeric"
                autoComplete="bday"
                dir="ltr"
                value={form.gregorianDate}
                onChange={handleGregorianChange}
                onKeyDown={handleGregorianKeyDown}
                onBlur={() => handleBlur('gregorianDate')}
                maxLength={10}
                aria-invalid={Boolean(errors.gregorianDate)}
                aria-describedby={errors.gregorianDate ? 'person-gregorian-error' : undefined}
                className={`${inputClasses(errors.gregorianDate)} text-center tabular-nums tracking-wider`}
                placeholder="dd/mm/yyyy"
              />
            </Field>

            <div className="rounded-2xl border border-line bg-surface/60 p-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.includeHebrew}
                  onChange={(event) => toggleHebrew(event.target.checked)}
                  className="h-5 w-5 shrink-0 accent-navy"
                />
                <span className="text-sm font-semibold text-navy">הוסף גם תאריך עברי</span>
              </label>

              {form.includeHebrew && (
                <div className="mt-3">
                  <div
                    ref={(node) => {
                      fieldRefs.current.hebrew = node
                    }}
                    tabIndex={-1}
                  >
                    <HebrewDatePicker
                      day={form.hebrewDay}
                      monthId={form.hebrewMonthId}
                      onDayChange={(value) => handleField('hebrewDay', value)}
                      onMonthChange={(value) => handleField('hebrewMonthId', value)}
                      invalid={Boolean(errors.hebrew)}
                      describedBy={errors.hebrew ? 'person-hebrew-error' : undefined}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    יום וחודש בלבד, ללא שנה. כשיש תאריך עברי, הספירה לאחור נעשית לפיו.
                  </p>
                  {errors.hebrew && (
                    <p id="person-hebrew-error" role="alert" className="mt-1.5 text-sm text-danger">
                      {errors.hebrew}
                    </p>
                  )}
                </div>
              )}
            </div>

            <Field id="person-notes" label="הערה" error={errors.notes}>
              <textarea
                ref={(node) => {
                  fieldRefs.current.notes = node
                }}
                id="person-notes"
                value={form.notes}
                onChange={(event) =>
                  handleField('notes', event.target.value.slice(0, NOTES_MAX_LENGTH))
                }
                onBlur={() => handleBlur('notes')}
                rows={2}
                maxLength={NOTES_MAX_LENGTH}
                placeholder="אופציונלי"
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={errors.notes ? 'person-notes-error' : 'person-notes-counter'}
                className={`${inputClasses(errors.notes)} resize-none`}
              />
              <p
                id="person-notes-counter"
                aria-live="polite"
                className={`text-xs ${notesRemaining <= 10 ? 'text-danger' : 'text-muted'}`}
              >
                נותרו {notesRemaining} תווים מתוך {NOTES_MAX_LENGTH}
              </p>
            </Field>
          </div>

          <div className="shrink-0 border-t border-line bg-cream px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
            {/* A save failure belongs here, not behind the sheet: the form
                is still open and still holds everything the user typed. */}
            {saveError && (
              <p
                role="alert"
                className="mb-3 rounded-xl border border-danger/30 bg-danger-pale px-3.5 py-2.5 text-sm text-danger"
              >
                {saveError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="min-h-12 flex-1 rounded-2xl border border-line-strong bg-cream-deep font-semibold text-navy active:bg-line"
              >
                ביטול
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-12 flex-1 rounded-2xl bg-navy font-semibold text-white shadow-sm active:bg-navy-deep disabled:opacity-60"
              >
                {saving ? 'שומר…' : 'שמירה'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Every rule the form enforces, in one place, keyed by field - so blur
 * validation, submit validation and "which field do I focus first" all
 * read from the same source instead of drifting apart.
 */
function validateForm(form) {
  const errors = {}

  const name = form.name.trim()
  if (!name) errors.name = 'יש להזין שם'
  else if (name.length < NAME_MIN_LENGTH) errors.name = `השם חייב להכיל לפחות ${NAME_MIN_LENGTH} תווים`
  else if (name.length > NAME_MAX_LENGTH) errors.name = `השם יכול להכיל עד ${NAME_MAX_LENGTH} תווים`

  const gregorian = validateGregorianInput(form.gregorianDate)
  if (!gregorian.ok) errors.gregorianDate = gregorian.error

  if (form.includeHebrew && (!form.hebrewDay || !form.hebrewMonthId)) {
    errors.hebrew = 'יש לבחור גם יום וגם חודש עבריים'
  }

  if (form.notes.length > NOTES_MAX_LENGTH) {
    errors.notes = `ההערה יכולה להכיל עד ${NOTES_MAX_LENGTH} תווים`
  }

  return errors
}

/**
 * Re-places the caret after `digitIndex` digits of `formatted`. Deferred
 * to the next frame because React re-renders the controlled input after
 * this handler returns, which would otherwise discard the selection.
 */
function restoreCaret(input, formatted, digitIndex) {
  let position = formatted.length
  if (digitIndex <= 0) {
    position = 0
  } else {
    let seen = 0
    for (let i = 0; i < formatted.length; i += 1) {
      if (formatted[i] >= '0' && formatted[i] <= '9') {
        seen += 1
        if (seen === digitIndex) {
          position = i + 1
          break
        }
      }
    }
  }

  requestAnimationFrame(() => {
    if (!input.isConnected) return
    input.setSelectionRange(position, position)
  })
}

function inputClasses(hasError) {
  // placeholder:text-muted (not a faded variant) keeps the "dd/mm/yyyy"
  // format hint legible at 5.4:1 on a phone screen in daylight.
  return `w-full min-h-12 rounded-2xl border bg-surface px-4 py-3 text-navy placeholder:text-muted focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-danger bg-danger-pale/40 focus:ring-danger'
      : 'border-line focus:border-gold-light focus:ring-gold'
  }`
}

function Field({ id, label, error, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-navy">
        {label}
        {hint && <span className="ms-2 font-normal text-muted">{hint}</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
