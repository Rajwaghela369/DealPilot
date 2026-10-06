import type { ReactNode } from 'react'
import { Button } from './Button'
import { Drawer } from './Drawer'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /**
   * What this will actually do -- not "are you sure?".
   *
   * Required rather than optional, because the confirmations in this app are
   * the places where the consequence is not obvious from the button: deleting
   * a contact leaves its meeting-attendee rows standing with a NULL
   * `contact_id` (1.6), and deleting a deal takes its meetings, documents and
   * every piece of evidence behind them. A dialog that only asks "are you
   * sure?" has told the user nothing they did not already know.
   */
  body: ReactNode
  confirmLabel?: string
  /** Shown above the buttons: a server refusal, usually a 409. */
  error?: ReactNode
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation, built on `Drawer` rather than as a second overlay primitive.
 *
 * The drawer already solved Escape-to-close, focus restoration and body-scroll
 * locking; a centred modal would need all three again for no behavioural gain.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  error,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Drawer
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="ui-stack">
        <div className="ui-confirm__body">{body}</div>
        {/* A refusal stays on screen beside the button that caused it. The
            409s here carry a next step, and a toast would take it away after
            eight seconds (plan 1.5). */}
        {error && <div className="ui-callout ui-callout--danger">{error}</div>}
      </div>
    </Drawer>
  )
}
