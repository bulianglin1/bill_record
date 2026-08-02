import { useMemo, useState } from 'react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { todayIsoDate } from '@/utils/format'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const

export interface DatePickerProps {
  value: string
  onChange: (date: string) => void
  /** YYYY-MM-DD */
  min?: string
  /** YYYY-MM-DD；默认今天 */
  max?: string
  placeholder?: string
  className?: string
  buttonClassName?: string
  'aria-label'?: string
}

function formatDateLabel(date: string): string {
  if (!date) return ''
  const [y, m, d] = date.slice(0, 10).split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}

function toYearMonth(date: string): string {
  return date.slice(0, 7)
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate()
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function buildCells(year: number, monthIndex0: number) {
  const firstWeekday = new Date(year, monthIndex0, 1).getDay()
  const total = daysInMonth(year, monthIndex0)
  const cells: Array<{ date: string; day: number } | null> = []
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null)
  for (let day = 1; day <= total; day += 1) {
    cells.push({
      day,
      date: `${year}-${pad2(monthIndex0 + 1)}-${pad2(day)}`,
    })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = '选择日期',
  className,
  buttonClassName,
  'aria-label': ariaLabel = '选择日期',
}: DatePickerProps) {
  const maxDate = max ?? todayIsoDate()
  const seed = value || maxDate
  const [viewYm, setViewYm] = useState(() => toYearMonth(seed))

  const year = Number(viewYm.slice(0, 4))
  const monthIndex0 = Number(viewYm.slice(5, 7)) - 1

  const cells = useMemo(
    () => buildCells(year, monthIndex0),
    [year, monthIndex0],
  )

  const title = `${year}年${monthIndex0 + 1}月`

  function shiftView(delta: number) {
    const d = new Date(year, monthIndex0 + delta, 1)
    setViewYm(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
  }

  const minYm = min ? toYearMonth(min) : undefined
  const maxYm = toYearMonth(maxDate)
  const canPrev = !minYm || viewYm > minYm
  const canNext = viewYm < maxYm

  return (
    <Popover className={clsx('relative', className)}>
      <PopoverButton
        type="button"
        onClick={() => setViewYm(toYearMonth(value || maxDate))}
        aria-label={ariaLabel}
        className={clsx(
          'inline-flex min-h-12 w-full items-center gap-2 rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-surface)_65%,var(--color-surface-elevated))] px-3 py-2.5 text-left text-sm outline-none transition',
          'hover:border-[color-mix(in_oklab,var(--color-accent)_40%,var(--color-line))]',
          'data-open:border-[color-mix(in_oklab,var(--color-accent)_55%,var(--color-line))] data-open:ring-2 data-open:ring-[color-mix(in_oklab,var(--color-accent)_22%,transparent)]',
          buttonClassName,
        )}
      >
        <CalendarDays size={16} className="shrink-0 text-[var(--color-accent)]" />
        <span className={value ? 'font-medium' : 'text-muted'}>
          {value ? formatDateLabel(value) : placeholder}
        </span>
      </PopoverButton>

      <PopoverPanel
        anchor="bottom start"
        className="z-40 mt-2 w-[19rem] rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-elevated)] p-3 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.45)] transition duration-150 data-closed:translate-y-1 data-closed:opacity-0"
      >
        {({ close }) => (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={!canPrev}
                onClick={() => shiftView(-1)}
                className="rounded-lg p-1.5 text-muted disabled:opacity-30"
                aria-label="上一月"
              >
                <ChevronLeft size={18} />
              </button>
              <p className="font-display text-sm font-semibold">{title}</p>
              <button
                type="button"
                disabled={!canNext}
                onClick={() => shiftView(1)}
                className="rounded-lg p-1.5 text-muted disabled:opacity-30"
                aria-label="下一月"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted">
              {WEEKDAYS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((cell, index) => {
                if (!cell) {
                  return <div key={`e-${index}`} className="min-h-9" />
                }
                const disabled =
                  (min !== undefined && cell.date < min) || cell.date > maxDate
                const selected = cell.date === value
                const isToday = cell.date === todayIsoDate()
                return (
                  <button
                    key={cell.date}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(cell.date)
                      close()
                    }}
                    className={clsx(
                      'min-h-9 rounded-xl text-sm transition',
                      selected
                        ? 'bg-[var(--color-accent)] font-medium text-white'
                        : isToday
                          ? 'bg-[color-mix(in_oklab,var(--color-accent)_14%,transparent)] font-medium'
                          : 'hover:bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)]',
                      disabled &&
                        'cursor-not-allowed opacity-25 hover:bg-transparent',
                    )}
                  >
                    {cell.day}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex justify-end border-t border-[var(--color-line)] pt-2">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-muted hover:text-[var(--color-ink)]"
                onClick={() => {
                  const today = todayIsoDate()
                  if ((!min || today >= min) && today <= maxDate) {
                    onChange(today)
                    setViewYm(toYearMonth(today))
                    close()
                  }
                }}
              >
                今天
              </button>
            </div>
          </div>
        )}
      </PopoverPanel>
    </Popover>
  )
}
