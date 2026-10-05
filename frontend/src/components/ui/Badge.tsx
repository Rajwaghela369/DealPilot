import type { ReactNode } from 'react'

/**
 * `tone` is the badge's whole API, and the five values are not interchangeable.
 *
 * `warn` and `danger` exist as separate tones because phase 5.5 requires it:
 * a `stale` claim is grounded in evidence that has been overtaken, a
 * `rejected` one is wrong, and rendering both amber would merge "trust this,
 * but check the date" with "do not trust this". Pick the tone from what the
 * state means, never from which colour looks better in the row.
 */
export type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent'

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  title?: string
}

export function Badge({ tone = 'neutral', children, title }: BadgeProps) {
  return (
    <span
      className={`ui-badge${tone !== 'neutral' ? ` ui-badge--${tone}` : ''}`}
      title={title}
    >
      {children}
    </span>
  )
}
