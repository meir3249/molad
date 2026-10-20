import { useState } from 'react'
import Wordmark from './Wordmark'

/**
 * First-load PIN prompt. Collects a 4-digit PIN and hands it to the
 * caller, which is responsible for persisting it to localStorage and
 * attaching it to API requests (see App.jsx and services/api.js).
 *
 * Security note: a 4-digit PIN kept in localStorage is a convenience
 * gate, not real authentication - it only has 10,000 possible values and
 * is readable by anything with access to the browser/device. Any real
 * enforcement must happen server-side in the Apps Script backend.
 */
export default function PinGate({ onSubmit }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  function handleChange(e) {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 4)
    setPin(digitsOnly)
    if (error) setError('')
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (pin.length !== 4) {
      setError('יש להזין 4 ספרות')
      return
    }
    onSubmit(pin)
  }

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-cream px-6">
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col items-center gap-6">
        <div className="flex flex-col items-center text-center">
          {/* The illustration carries the app name itself, so it stands
              alone here rather than being paired with a text wordmark. */}
          <h1>
            <Wordmark variant="mark" markSize={104} className="drop-shadow-sm" />
          </h1>
          <p className="mt-4 text-sm text-muted">הזן קוד בן 4 ספרות לפתיחת ימי ההולדת</p>
        </div>

        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          dir="ltr"
          value={pin}
          onChange={handleChange}
          maxLength={4}
          aria-label="קוד בן 4 ספרות"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'pin-error' : undefined}
          className="w-full rounded-2xl border border-line bg-surface py-4 text-center font-mono text-3xl tracking-[0.75em] text-navy placeholder:text-line-strong focus:border-gold-light focus:outline-none focus:ring-2 focus:ring-gold"
          placeholder="----"
        />

        {error && (
          <p id="pin-error" role="alert" className="-mt-2 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="min-h-12 w-full rounded-2xl bg-navy font-semibold text-white shadow-sm transition-colors active:bg-navy-deep"
        >
          כניסה
        </button>
      </form>
    </div>
  )
}
