import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

/**
 * A right-hand panel over the current page.
 *
 * Built in phase 0 because phase 5 -- the evidence drawer, the most important
 * component in the app -- is this plus an `EvidenceList`, and the dialog
 * mechanics are the part worth getting right once: Escape closes, the scrim
 * closes, focus moves in on open and back to the opener on close, and the
 * body does not scroll behind it.
 */
export function Drawer({ open, onClose, title, description, footer, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Remembered on open so focus can go back where it came from. Without it,
  // closing the drawer drops the caret at the top of the document and a
  // keyboard user loses their place in the list they opened it from.
  const openerRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return

    openerRef.current = document.activeElement
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (openerRef.current instanceof HTMLElement) {
        openerRef.current.focus()
      }
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className="ui-drawer__scrim" onClick={onClose} />
      <div
        className="ui-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="ui-drawer__header">
          <div>
            <h2 className="ui-drawer__title">{title}</h2>
            {description && <p className="ui-drawer__description">{description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            &#10005;
          </Button>
        </header>
        <div className="ui-drawer__body">{children}</div>
        {footer && <div className="ui-drawer__footer">{footer}</div>}
      </div>
    </>
  )
}
