import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ToastContext } from './toastContext'
import type { ToastApi } from './toastContext'
import './toast.css'

type ToastTone = 'error' | 'ok'

interface Toast {
  id: number
  tone: ToastTone
  message: string
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId++
      setToasts((current) => [...current, { id, tone, message }])
      // Errors stay longer: they are usually a sentence, not a word.
      window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      error: (message: string) => push('error', message),
      success: (message: string) => push('ok', message),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* `role="status"` with `aria-live="polite"` so a failure is announced
          without stealing focus from whatever the user is typing into. */}
      <div className="ui-toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`ui-toast ui-toast--${toast.tone}`}>
            <span className="ui-toast__message">{toast.message}</span>
            <button
              type="button"
              className="ui-toast__close"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              &#10005;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
