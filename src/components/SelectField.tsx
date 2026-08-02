/**
 * 自定义下拉：替代原生 select，样式与 MonthPicker 对齐。
 */
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react'
import { Check, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

export interface SelectFieldProps<T extends string = string> {
  value: T
  onChange: (value: T) => void
  options: SelectOption<T>[]
  placeholder?: string
  disabled?: boolean
  className?: string
  buttonClassName?: string
  optionsClassName?: string
  'aria-label'?: string
  /** 打开面板时回调（如懒加载选项） */
  onOpen?: () => void
}

export function SelectField<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = '请选择',
  disabled = false,
  className,
  buttonClassName,
  optionsClassName,
  'aria-label': ariaLabel,
  onOpen,
}: SelectFieldProps<T>) {
  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? (value ? value : placeholder)
  const showPlaceholder = !selected

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={clsx('relative', className)}>
        <ListboxButton
          aria-label={ariaLabel}
          onClick={() => onOpen?.()}
          className={clsx(
            'group inline-flex min-h-10 w-full items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-surface)_40%,var(--color-surface-elevated))] px-3 py-2 text-left text-sm font-medium outline-none transition',
            'hover:border-[color-mix(in_oklab,var(--color-accent)_40%,var(--color-line))]',
            'data-open:border-[color-mix(in_oklab,var(--color-accent)_55%,var(--color-line))] data-open:ring-2 data-open:ring-[color-mix(in_oklab,var(--color-accent)_22%,transparent)]',
            'data-disabled:cursor-not-allowed data-disabled:opacity-50',
            buttonClassName,
          )}
        >
          <span
            className={clsx(
              'min-w-0 flex-1 truncate',
              showPlaceholder && 'text-muted',
            )}
          >
            {label}
          </span>
          <ChevronDown
            size={15}
            className="shrink-0 text-muted transition group-data-open:rotate-180"
            aria-hidden
          />
        </ListboxButton>

        <ListboxOptions
          anchor="bottom start"
          className={clsx(
            'z-40 mt-2 max-h-60 w-[var(--button-width)] min-w-[10rem] overflow-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-elevated)] p-1.5 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.45)] outline-none transition duration-150',
            'data-closed:translate-y-1 data-closed:opacity-0',
            optionsClassName,
          )}
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">{placeholder}</p>
          ) : (
            options.map((option) => (
              <ListboxOption
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={clsx(
                  'group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm outline-none transition select-none',
                  'data-focus:bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)]',
                  'data-selected:bg-[var(--color-accent)] data-selected:font-medium data-selected:text-white',
                  'data-disabled:cursor-not-allowed data-disabled:opacity-40',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <Check
                  size={14}
                  className="shrink-0 opacity-0 group-data-selected:opacity-100"
                  aria-hidden
                />
              </ListboxOption>
            ))
          )}
        </ListboxOptions>
      </div>
    </Listbox>
  )
}
