import type { ReactNode } from 'react'

export interface CardProps {
  title?: ReactNode
  description?: ReactNode
  /** Right-hand side of the header: the card's own actions. */
  actions?: ReactNode
  /** Drops the body padding, for a table that should reach the card edges. */
  flush?: boolean
  className?: string
  children: ReactNode
}

export function Card({ title, description, actions, flush, className, children }: CardProps) {
  const hasHeader = Boolean(title || description || actions)

  return (
    <section className={['ui-card', className].filter(Boolean).join(' ')}>
      {hasHeader && (
        <header className="ui-card__header">
          <div className="ui-card__titles">
            {title && <h2 className="ui-card__title">{title}</h2>}
            {description && <p className="ui-card__description">{description}</p>}
          </div>
          {actions && <div className="ui-row">{actions}</div>}
        </header>
      )}
      <div className={`ui-card__body${flush ? ' ui-card__body--flush' : ''}`}>{children}</div>
    </section>
  )
}
