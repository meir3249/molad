import { useMemo, useState } from 'react'
import { HDate, gematriya } from '@hebcal/hdate'
import {
  getMonthOccurrences,
  hebrewMonthLabel,
  hebrewYearLabel,
  startOfDay,
} from '../utils/dateUtils'

/** Sunday-first, matching both the Hebrew week and he-IL convention. */
const WEEKDAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

/** Dots drawn in a cell before collapsing to a "+N" count. */
const MAX_DOTS = 3

/**
 * Month-grid view of everybody's birthdays - the app's landing view.
 *
 * Why a grid at all, in an app whose spec asks for a single scrolling
 * feed: the feed answers "who's next", which is the right question most
 * of the time but a useless one for "is anything happening the week I'm
 * away". The grid answers that at a glance, and hands off to the feed
 * for anything that needs detail, so neither view duplicates the other.
 *
 * The grid is Gregorian, not Hebrew. Hebrew birthdays are still here -
 * every one of them is converted to the Gregorian day it actually falls
 * on (postponements included, via getMonthOccurrences) - but the grid
 * itself has to be the calendar the user's phone, bus timetable and
 * everyone else's calendar are in. Each cell carries its Hebrew day
 * numeral underneath the Gregorian one so the Hebrew date is never more
 * than a glance away, and the month heading names both months the
 * Gregorian month spans.
 *
 * Interaction splits by role, which is the whole point of the admin
 * check in App.jsx:
 *
 *   any user    a day holding birthdays is a button; tapping it hands
 *               the date up to App, which switches to the list view
 *               focused on that day. A day with nothing on it is inert
 *               text, so the grid never offers a tap that does nothing.
 *   admin only  an empty day is *also* a button, and tapping it opens
 *               the add sheet with that day and month already filled in.
 *               Only the year is left to type, because the sheet
 *               (rightly) refuses future birth dates and the grid is
 *               usually showing the current month or later.
 */
export default function CalendarView({ people, isAdmin, onSelectDay, onAddOnDay }) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  }))

  const byDay = useMemo(
    () => getMonthOccurrences(people, cursor.year, cursor.month),
    [people, cursor.year, cursor.month],
  )

  const { cells, heading, hebrewHeading } = useMemo(
    () => buildMonth(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  )

  function shiftMonth(delta) {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month - 1 + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() + 1 }
    })
  }

  const isCurrentMonth =
    cursor.year === today.getFullYear() && cursor.month === today.getMonth() + 1

  const monthTotal = useMemo(() => {
    let total = 0
    for (const entries of byDay.values()) total += entries.length
    return total
  }, [byDay])

  return (
    <section dir="rtl" aria-label="לוח שנה של ימי הולדת" className="flex flex-col">
      <div className="mb-3 flex items-center gap-2">
        {/* In RTL the earlier month sits to the right, so "previous" is
            the right-hand control and its chevron points right. */}
        <NavButton label="החודש הקודם" onClick={() => shiftMonth(-1)} direction="prev" />

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-base font-semibold text-navy">{heading}</p>
          <p className="truncate text-xs text-muted">{hebrewHeading}</p>
        </div>

        <NavButton label="החודש הבא" onClick={() => shiftMonth(1)} direction="next" />
      </div>

      {!isCurrentMonth && (
        <button
          type="button"
          onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() + 1 })}
          className="mx-auto mb-3 min-h-9 rounded-full border border-line-strong bg-surface px-4 text-xs font-semibold text-navy-soft active:bg-gold-pale"
        >
          חזרה לחודש הנוכחי
        </button>
      )}

      <div className="rounded-3xl border border-line bg-surface p-2 shadow-sm">
        {/* Hidden from assistive tech: each day cell already carries its
            own full weekday-and-date label, so reading the column
            headers too would just double everything up. */}
        <div aria-hidden="true" className="grid grid-cols-7 gap-1 pb-1">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="py-1 text-center text-xs font-semibold text-muted">
              {label}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell) =>
            cell.blank ? (
              // Leading blanks keep the 7-column rhythm without rendering
              // days from the neighbouring month, which would be markable
              // but aren't part of this month's data.
              <span key={cell.key} />
            ) : (
              <DayCell
                key={cell.iso}
                cell={cell}
                entries={byDay.get(cell.day) ?? []}
                isToday={cell.date.getTime() === today.getTime()}
                isAdmin={isAdmin}
                onSelectDay={onSelectDay}
                onAddOnDay={onAddOnDay}
              />
            ),
          )}
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        {monthTotal === 0
          ? 'אין ימי הולדת בחודש זה'
          : `${monthTotal} ימי הולדת בחודש זה · הקש על יום מסומן לצפייה`}
      </p>
      {isAdmin && (
        <p className="mt-1 text-center text-xs text-muted">
          הקשה על יום פנוי מוסיפה יום הולדת בתאריך זה
        </p>
      )}
    </section>
  )
}

/**
 * One day in the grid.
 *
 * Rendered as a <button> only when tapping it will actually do
 * something - a marked day for anyone, an empty day for an admin - and
 * as plain text otherwise. The alternative, a disabled button, would
 * still be reachable by keyboard and would advertise an affordance that
 * isn't there.
 */
function DayCell({ cell, entries, isToday, isAdmin, onSelectDay, onAddOnDay }) {
  const count = entries.length
  const hasBirthdays = count > 0
  const interactive = hasBirthdays || isAdmin

  const base =
    'relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-colors'

  const tone = hasBirthdays
    ? 'bg-gold-pale border border-gold-light font-semibold text-navy'
    : isToday
      ? 'bg-cream-deep border border-line-strong text-navy'
      : 'border border-transparent text-navy-soft'

  const content = (
    <>
      <span className={`leading-none tabular-nums ${isToday ? 'font-bold' : ''}`}>{cell.day}</span>
      <span className="mt-0.5 text-[0.6rem] leading-none text-muted">{cell.hebrewDay}</span>

      {hasBirthdays && (
        <span className="absolute bottom-1 flex items-center gap-[2px]">
          {count <= MAX_DOTS ? (
            Array.from({ length: count }, (_, i) => (
              <span key={i} className="h-1 w-1 rounded-full bg-gold" />
            ))
          ) : (
            <span className="text-[0.6rem] font-bold leading-none text-gold">{count}</span>
          )}
        </span>
      )}

      {isToday && (
        <span className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-navy" />
      )}
    </>
  )

  if (!interactive) {
    return (
      <span className={`${base} ${tone} opacity-70`} aria-label={cell.fullLabel}>
        {content}
      </span>
    )
  }

  // Describing the names in the label rather than just the count means a
  // screen-reader user gets the same information the dots carry visually.
  const names = entries.map((entry) => entry.person.name)
  const uniqueNames = [...new Set(names)]
  const label = hasBirthdays
    ? `${cell.fullLabel} - יום הולדת: ${uniqueNames.join(', ')}`
    : `${cell.fullLabel} - הוספת יום הולדת`

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => (hasBirthdays ? onSelectDay(cell.date) : onAddOnDay(cell.date))}
      className={`${base} ${tone} active:scale-95 ${
        hasBirthdays ? 'active:bg-gold-light' : 'active:bg-cream-deep'
      }`}
    >
      {content}
    </button>
  )
}

function NavButton({ label, onClick, direction }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-navy-soft active:bg-cream-deep"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-4 w-4"
      >
        <path d={direction === 'prev' ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} />
      </svg>
    </button>
  )
}

/**
 * Builds the 7-column cell array for a month, plus its two headings.
 *
 * `cells` is padded with nulls so the 1st lands under the right weekday
 * column; `getDay()` is already 0 = Sunday, which matches
 * WEEKDAY_LABELS' Sunday-first order directly.
 *
 * The Hebrew heading names every Hebrew month the Gregorian month
 * touches (almost always two, since the Hebrew month starts mid-way
 * through) with the Hebrew year appended once - so "נובמבר 2026" reads
 * as "חשוון - כסלו תשפ״ז" rather than claiming a single Hebrew month.
 */
function buildMonth(year, month) {
  const first = new Date(year, month - 1, 1)
  const dayCount = new Date(year, month, 0).getDate()

  const cells = Array.from({ length: first.getDay() }, (_, i) => ({
    blank: true,
    key: `blank-${i}`,
  }))
  for (let day = 1; day <= dayCount; day += 1) {
    const date = new Date(year, month - 1, day)
    const hd = new HDate(date)
    cells.push({
      day,
      date,
      iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      hebrewDay: gematriya(hd.getDate()),
      fullLabel: date.toLocaleDateString('he-IL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    })
  }

  const heading = first.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })

  const startHd = new HDate(first)
  const endHd = new HDate(new Date(year, month - 1, dayCount))
  const startMonth = hebrewMonthLabel(startHd.getMonth(), startHd.isLeapYear())
  const endMonth = hebrewMonthLabel(endHd.getMonth(), endHd.isLeapYear())
  const years = [...new Set([startHd.getFullYear(), endHd.getFullYear()])]
    .map((hebrewYear) => hebrewYearLabel(hebrewYear))
    .join(' / ')
  const months = startMonth === endMonth ? startMonth : `${startMonth} – ${endMonth}`

  return { cells, heading, hebrewHeading: `${months} ${years}` }
}
