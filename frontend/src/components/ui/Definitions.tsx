import type { ReactNode } from 'react'

/**
 * Label-over-value pairs, used by the account header (1.3) and the deal
 * overview (3.3).
 *
 * A `<dl>` rather than a grid of divs: these genuinely are term/description
 * pairs, and the markup is what lets a screen reader read "Industry,
 * Software" instead of two unrelated strings.
 */
export function Definitions({ children }: { children: ReactNode }) {
  return <dl className="ui-defs">{children}</dl>
}

export interface DefinitionProps {
  label: ReactNode
  children: ReactNode
}

export function Definition({ label, children }: DefinitionProps) {
  return (
    <div>
      <dt className="ui-def__label">{label}</dt>
      <dd className="ui-def__value">{children}</dd>
    </div>
  )
}
