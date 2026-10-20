import { useRef, useState } from 'react'
import { HEBREW_DAYS, HEBREW_MONTHS } from '../constants'

/**
 * Hebrew day + month picker for the add sheet.
 *
 * Replaces the two native <select> dropdowns this used to be. A native
 * select rendered its 30 gematriya day options as a list taller than the
 * viewport, so the high days (כ״ד ... ל׳) and the later months sat
 * off-screen and were effectively unreachable on a phone. Instead each
 * field is a trigger button that opens a grid *inside* the sheet: the
 * grid is bounded by max-height and scrolls within itself, so nothing can
 * escape the viewport no matter how short the screen is, and every option
 * is a 44px tap target rather than a 1-line list row.
 *
 * Only one panel is open at a time, which keeps the sheet's height
 * predictable.
 *
 * The month grid deliberately keeps all 14 HEBREW_MONTHS entries,
 * including "אדר א׳", "אדר ב׳" and plain "אדר" as three separate
 * choices - see constants.js for why that distinction is load-bearing for
 * leap-year math rather than a duplicate.
 */
export default function HebrewDatePicker({ day, monthId, onDayChange, onMonthChange, invalid, describedBy }) {
  const [openPanel, setOpenPanel] = useState(null) // 'day' | 'month' | null
  const dayTriggerRef = useRef(null)
  const monthTriggerRef = useRef(null)

  const dayLabel = HEBREW_DAYS.find((d) => d.value === day)?.label ?? null
  const monthLabel = HEBREW_MONTHS.find((m) => m.id === monthId)?.label ?? null

  function toggle(panel) {
    setOpenPanel((prev) => (prev === panel ? null : panel))
  }

  function closePanel(panel) {
    setOpenPanel(null)
    const trigger = panel === 'day' ? dayTriggerRef : monthTriggerRef
    trigger.current?.focus()
  }

  // Escape closes the open grid only - stopPropagation keeps it from also
  // reaching the sheet's own Escape handler and closing the whole form.
  function handlePanelKeyDown(event, panel) {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    closePanel(panel)
  }

  return (
    <div className="flex flex-col">
      <div className="flex gap-2">
        <Trigger
          ref={dayTriggerRef}
          className="w-28 shrink-0"
          label={dayLabel}
          placeholder="יום"
          expanded={openPanel === 'day'}
          invalid={invalid}
          describedBy={describedBy}
          onClick={() => toggle('day')}
          ariaLabel="יום בחודש העברי"
        />
        <Trigger
          ref={monthTriggerRef}
          className="flex-1 min-w-0"
          label={monthLabel}
          placeholder="חודש"
          expanded={openPanel === 'month'}
          invalid={invalid}
          describedBy={describedBy}
          onClick={() => toggle('month')}
          ariaLabel="חודש עברי"
        />
      </div>

      {openPanel === 'day' && (
        <div
          role="group"
          aria-label="בחירת יום בחודש העברי"
          onKeyDown={(event) => handlePanelKeyDown(event, 'day')}
          className="mt-2 grid max-h-52 grid-cols-6 gap-1.5 overflow-y-auto rounded-2xl border border-line bg-cream p-2"
        >
          {HEBREW_DAYS.map((option) => (
            <Option
              key={option.value}
              selected={option.value === day}
              onClick={() => {
                onDayChange(option.value)
                closePanel('day')
              }}
            >
              {option.label}
            </Option>
          ))}
        </div>
      )}

      {openPanel === 'month' && (
        <div
          role="group"
          aria-label="בחירת חודש עברי"
          onKeyDown={(event) => handlePanelKeyDown(event, 'month')}
          className="mt-2 grid max-h-52 grid-cols-3 gap-1.5 overflow-y-auto rounded-2xl border border-line bg-cream p-2"
        >
          {HEBREW_MONTHS.map((option) => (
            <Option
              key={option.id}
              selected={option.id === monthId}
              onClick={() => {
                onMonthChange(option.id)
                closePanel('month')
              }}
            >
              {option.label}
            </Option>
          ))}
        </div>
      )}
    </div>
  )
}

function Trigger({ ref, className, label, placeholder, expanded, invalid, describedBy, onClick, ariaLabel }) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={`flex min-h-12 items-center justify-between gap-2 rounded-2xl border bg-surface px-4 py-3 text-start transition-colors ${className} ${
        invalid
          ? 'border-danger'
          : expanded
            ? 'border-gold-light ring-2 ring-gold'
            : 'border-line'
      }`}
    >
      <span className={`truncate ${label ? 'text-navy' : 'text-muted'}`}>{label ?? placeholder}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        aria-hidden="true"
        className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  )
}

function Option({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex h-11 items-center justify-center rounded-xl border text-base transition-colors ${
        selected
          ? 'border-navy bg-navy font-semibold text-white'
          : 'border-line bg-surface text-navy active:bg-gold-pale'
      }`}
    >
      {children}
    </button>
  )
}
