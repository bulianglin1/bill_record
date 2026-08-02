import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'
import { AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 应用内确认弹层（替代原生 window.confirm） */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} className="relative z-[60]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition duration-200 data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex items-end justify-center p-4 sm:items-center">
        <DialogPanel
          transition
          className="panel w-full max-w-sm rounded-3xl p-5 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45)] transition duration-200 data-closed:translate-y-3 data-closed:opacity-0 sm:data-closed:translate-y-2"
        >
          <div className="flex items-start gap-3">
            <div
              className={clsx(
                'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
                danger
                  ? 'bg-[color-mix(in_oklab,var(--color-danger)_14%,transparent)] text-[var(--color-danger)]'
                  : 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]',
              )}
            >
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-display text-lg font-semibold">
                {title}
              </DialogTitle>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{message}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-2xl border border-[var(--color-line)] text-sm font-medium"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={clsx(
                'min-h-11 rounded-2xl text-sm font-medium text-white',
                danger
                  ? 'bg-[var(--color-danger)]'
                  : 'bg-[var(--color-accent)]',
              )}
            >
              {confirmText}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
