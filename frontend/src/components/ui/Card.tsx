import { useId, useState } from 'react'
import type { ReactNode } from 'react'

export interface CardProps {
  title?: ReactNode
  description?: ReactNode
  /** Right-hand side of the header: the card's own actions. */
  actions?: ReactNode
  /**
   * Explanatory help, behind an ⓘ in the header.
   *
   * Collapsed by default, and that is the point. Screens that need explaining
   * used to carry it as a permanent block of prose, which cost every return
   * visitor the same vertical space the first visitor needed — and once text is
   * always there it stops being read. Behind a toggle it is available on demand
   * and invisible the rest of the time.
   */
  info?: ReactNode
  /** Drops the body padding, for a table that should reach the card edges. */
  flush?: boolean
  className?: string
  children: ReactNode
}

export function Card({
  title,
  description,
  actions,
  info,
  flush,
  className,
  children,
}: CardProps) {
  const [showInfo, setShowInfo] = useState(false)
  const panelId = useId()
  const hasHeader = Boolean(title || description || actions || info)

  return (
    <section className={['ui-card', className].filter(Boolean).join(' ')}>
      {hasHeader && (
        <header className="ui-card__header">
          <div className="ui-card__titles">
            {title && <h2 className="ui-card__title">{title}</h2>}
            {description && <p className="ui-card__description">{description}</p>}
          </div>
          <div className="ui-row">
            {actions}
            {info && (
              <button
                type="button"
                className={`ui-info-toggle${showInfo ? ' is-open' : ''}`}
                // `aria-expanded` and `aria-controls` rather than just a title:
                // this is a disclosure, and a screen reader should be able to
                // tell it is one and whether it is currently open.
                aria-expanded={showInfo}
                aria-controls={panelId}
                aria-label={showInfo ? 'Hide help' : 'About this screen'}
                title={showInfo ? 'Hide help' : 'About this screen'}
                onClick={() => setShowInfo((v) => !v)}
              >
                i
              </button>
            )}
          </div>
        </header>
      )}

      {/* Above the body rather than inside it, so a flush card can still carry
          help without the table inheriting its padding. */}
      {info && showInfo && (
        <div className="ui-card__info" id={panelId}>
          {info}
        </div>
      )}

      <div className={`ui-card__body${flush ? ' ui-card__body--flush' : ''}`}>{children}</div>
    </section>
  )
}
