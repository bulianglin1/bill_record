import { useMemo, useState } from 'react'
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react'
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { currentYearMonth } from '@/services/cloudAssetSnapshotService'

const MONTH_LABELS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
] as const

export interface MonthPickerProps {
  value: string
  onChange: (yearMonth: string) => void
  /** YYYY-MM，含 */
  min?: string
  /** YYYY-MM，含；默认当前月 */
  max?: string
  /** 空值时的展示文案 */
  placeholder?: string
  /** 是否允许清空（筛选场景） */
  allowClear?: boolean
  className?: string
  buttonClassName?: string
  'aria-label'?: string
}

function formatYearMonthLabel(yearMonth: string): string {
  if (!yearMonth) return ''
  const [y, m] = yearMonth.split('-')
  return `${y}年${Number(m)}月`
}

function parseYear(yearMonth: string, fallback: number): number {
  const y = Number(yearMonth.slice(0, 4))
  return Number.isFinite(y) ? y : fallback
}

export function MonthPicker({
  value,
  onChange,
  min,
  max,
  placeholder = '选择月份',
  allowClear = false,
  className,
  buttonClassName,
  'aria-label': ariaLabel = '选择月份',
}: MonthPickerProps) {
  const maxMonth = max ?? currentYearMonth()
  const [viewYear, setViewYear] = useState(() =>
    parseYear(value || maxMonth, new Date().getFullYear()),
  )

  const minYear = min ? parseYear(min, 1970) : undefined
  const maxYear = parseYear(maxMonth, new Date().getFullYear())

  const months = useMemo(() => {
    return MONTH_LABELS.map((label, index) => {
      const ym = `${viewYear}-${String(index + 1).padStart(2, '0')}`
      const disabled = (min !== undefined && ym < min) || ym > maxMonth
      return { ym, label, disabled }
    })
  }, [viewYear, min, maxMonth])

  return (
    <Popover className={clsx('relative', className)}>
      <PopoverButton
        type="button"
        onClick={() =>
          setViewYear(parseYear(value || maxMonth, new Date().getFullYear()))
        }
        aria-label={ariaLabel}
        className={clsx(
          'inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-surface)_40%,var(--color-surface-elevated))] px-3 py-2 text-sm font-medium outline-none transition',
          'hover:border-[color-mix(in_oklab,var(--color-accent)_40%,var(--color-line))]',
          'data-open:border-[color-mix(in_oklab,var(--color-accent)_55%,var(--color-line))] data-open:ring-2 data-open:ring-[color-mix(in_oklab,var(--color-accent)_22%,transparent)]',
          buttonClassName,
        )}
      >
        <CalendarRange size={15} className="shrink-0 text-[var(--color-accent)]" />
        <span className={value ? '' : 'text-muted'}>
          {value ? formatYearMonthLabel(value) : placeholder}
        </span>
      </PopoverButton>

      <PopoverPanel
        anchor="bottom start"
        className="z-40 mt-2 w-[17.5rem] rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-elevated)] p-3 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.45)] transition duration-150 data-closed:translate-y-1 data-closed:opacity-0"
      >
        {({ close }) => (
          <div>
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={minYear !== undefined && viewYear <= minYear}
                onClick={() => setViewYear((y) => y - 1)}
                className="rounded-lg p-1.5 text-muted disabled:opacity-30"
                aria-label="上一年"
              >
                <ChevronLeft size={18} />
              </button>
              <p className="font-display text-sm font-semibold">{viewYear}年</p>
              <button
                type="button"
                disabled={viewYear >= maxYear}
                onClick={() => setViewYear((y) => y + 1)}
                className="rounded-lg p-1.5 text-muted disabled:opacity-30"
                aria-label="下一年"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {months.map((item) => {
                const selected = item.ym === value
                return (
                  <button
                    key={item.ym}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      onChange(item.ym)
                      close()
                    }}
                    className={clsx(
                      'min-h-10 rounded-xl text-sm transition',
                      selected
                        ? 'bg-[var(--color-accent)] font-medium text-white'
                        : 'text-[var(--color-ink)] hover:bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)]',
                      item.disabled &&
                        'cursor-not-allowed opacity-30 hover:bg-transparent',
                    )}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>

            <div className="mt-3 flex justify-between gap-2 border-t border-[var(--color-line)] pt-2">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-muted hover:text-[var(--color-ink)]"
                onClick={() => {
                  const thisMonth = currentYearMonth()
                  if ((!min || thisMonth >= min) && thisMonth <= maxMonth) {
                    onChange(thisMonth)
                    setViewYear(parseYear(thisMonth, viewYear))
                    close()
                  }
                }}
              >
                本月
              </button>
              {allowClear && value ? (
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-xs text-muted hover:text-[var(--color-ink)]"
                  onClick={() => {
                    onChange('')
                    close()
                  }}
                >
                  清除
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        )}
      </PopoverPanel>
    </Popover>
  )
}

export { formatYearMonthLabel }
