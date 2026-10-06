import { useCallback, useState } from 'react'

const KEY = 'dealpilot.sidebar.collapsed'

/**
 * Whether the sidebar is collapsed, remembered per browser.
 *
 * `localStorage` is the right home for this and a poor home for most things.
 * It is a per-viewer convenience -- it never needs to reach another device, the
 * server, or anyone else -- which is exactly the category the storage is for.
 *
 * Every access is wrapped: the accessor *throws* in a private window with site
 * data blocked, and returns nothing during SSR where `window` is absent. A
 * sidebar that cannot render because a preference could not be read would be a
 * poor trade, so a failure falls back to expanded.
 */
function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

function write(value: boolean): void {
  try {
    window.localStorage.setItem(KEY, String(value))
  } catch {
    // Nothing to do. The preference lasts for this session instead.
  }
}

export function useSidebarState(): { collapsed: boolean; toggle: () => void } {
  // Lazy initial state so the read happens once, not on every render, and so
  // SSR never touches `window`.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== 'undefined' && read(),
  )

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      write(!current)
      return !current
    })
  }, [])

  return { collapsed, toggle }
}
