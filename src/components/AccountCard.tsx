import { Landmark, Smartphone, Wallet, CircleDollarSign } from 'lucide-react'
import type { Account, AccountType } from '@/types'
import { formatMoney } from '@/utils/format'

interface AccountCardProps {
  account: Account
  onClick?: () => void
}

const TYPE_LABEL: Record<AccountType, string> = {
  bank: '银行',
  payment: '支付',
  cash: '现金',
  other: '其他',
}

function TypeIcon({ type }: { type: Account['type'] }) {
  if (type === 'bank') return <Landmark size={16} />
  if (type === 'payment') return <Smartphone size={16} />
  if (type === 'cash') return <Wallet size={16} />
  return <CircleDollarSign size={16} />
}

export function AccountCard({ account, onClick }: AccountCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="panel flex w-full flex-col gap-3 rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:opacity-95"
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: account.color }}
        >
          <TypeIcon type={account.type} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{account.name}</p>
          <p className="text-xs text-muted">{TYPE_LABEL[account.type]}</p>
        </div>
      </div>
      <p className="font-display text-2xl font-semibold tracking-tight">
        {formatMoney(account.balance)}
      </p>
    </button>
  )
}
