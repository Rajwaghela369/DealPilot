import { createContext, useContext } from 'react'

export interface ToastApi {
  /**
   * A mutation failed. Phase 0 asks for exactly one of these, and this is it.
   *
   * Worth being clear on what a toast is *not* for: the 409s in phase 1.5 and
   * the upload refusals in 4.2 belong beside the control that caused them,
   * because they carry a next step ("link to that contact instead",
   * "re-save as .docx") and a toast takes that away after eight seconds. A
   * toast is for a failure the user can only acknowledge.
   */
  error: (message: string) => void
  success: (message: string) => void
}

/**
 * Split from `Toast.tsx` so that file exports only its component.
 *
 * A module exporting both a component and a hook loses fast refresh for the
 * component, which in practice means every toast edit full-reloads the page
 * and discards whatever state was being tested.
 */
export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}
