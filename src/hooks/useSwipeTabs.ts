import { useCallback, useRef, type TouchEvent } from 'react'
import type { AppTab } from '@/components/Layout'

const TAB_ORDER: AppTab[] = ['dashboard', 'transactions', 'accounts', 'settings']
const SWIPE_THRESHOLD = 56

/**
 * 手机端左右滑动切换主 Tab。
 * 垂直滚动时忽略，避免与列表冲突。
 */
export function useSwipeTabs(
  tab: AppTab,
  onTabChange: (tab: AppTab) => void,
) {
  const startX = useRef(0)
  const startY = useRef(0)
  const locked = useRef<'x' | 'y' | null>(null)

  const onTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    startX.current = touch.clientX
    startY.current = touch.clientY
    locked.current = null
  }, [])

  const onTouchMove = useCallback((e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch || locked.current) return
    const dx = Math.abs(touch.clientX - startX.current)
    const dy = Math.abs(touch.clientY - startY.current)
    if (dx < 8 && dy < 8) return
    locked.current = dx > dy ? 'x' : 'y'
  }, [])

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (locked.current !== 'x') return
      const touch = e.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - startX.current
      if (Math.abs(dx) < SWIPE_THRESHOLD) return

      const index = TAB_ORDER.indexOf(tab)
      if (index < 0) return
      if (dx < 0 && index < TAB_ORDER.length - 1) {
        onTabChange(TAB_ORDER[index + 1]!)
      } else if (dx > 0 && index > 0) {
        onTabChange(TAB_ORDER[index - 1]!)
      }
    },
    [tab, onTabChange],
  )

  return { onTouchStart, onTouchMove, onTouchEnd }
}
