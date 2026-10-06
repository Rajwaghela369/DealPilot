import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Right-hand side: the page's primary action. */
  actions?: ReactNode
}

/**
 * Title, one line of context, and the page's primary action.
 *
 * Shared so the title sits at the same height on every screen -- the plan's
 * "elegance here means restraint" is mostly this sort of thing, and twelve
 * pages each spacing their own `<h1>` is how that goes wrong.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-row">{actions}</div>}
    </header>
  )
}
