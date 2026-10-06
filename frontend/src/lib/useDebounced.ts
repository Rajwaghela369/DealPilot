import { useEffect, useState } from 'react'

/**
 * Hold a value still until it stops changing.
 *
 * Used by every search box here. Without it each keystroke is a request and a
 * cache entry, and `?q=a`, `?q=ac`, `?q=acm` can land out of order -- so the
 * table briefly shows results for a prefix the box no longer contains.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return settled
}
