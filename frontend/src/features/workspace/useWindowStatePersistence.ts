import { useEffect } from 'react'
import { persistWindowState } from '@/lib/backend'

export function useWindowStatePersistence(setError: (error: string | null) => void) {
  useEffect(() => {
    let timerId: number | null = null

    function scheduleWindowStatePersist() {
      if (timerId) {
        window.clearTimeout(timerId)
      }

      // 使用防抖避免连续拖拽窗口时频繁写盘 / debounce resize bursts to avoid excessive writes while dragging.
      timerId = window.setTimeout(() => {
        persistWindowState().catch((err) => setError(err.message || String(err)))
      }, 200)
    }

    window.addEventListener('resize', scheduleWindowStatePersist)

    return () => {
      window.removeEventListener('resize', scheduleWindowStatePersist)
      if (timerId) {
        window.clearTimeout(timerId)
      }
    }
  }, [setError])
}
