import { useState } from 'react'
import type { RiskListItem, RiskStatus, RiskUpdate } from '../../lib/types'
import { humanise } from '../../lib/format'
import { Button, Drawer, TextAreaField } from '../../components/ui'
import { errorMessage } from '../../lib/errorMessage'

export interface RiskStatusControlProps {
  risk: RiskListItem
  busy?: boolean
  error?: unknown
  onSubmit: (body: RiskUpdate) => void
}

/**
 * What each transition means. Three of the four have a consequence worth
 * stating before someone picks it.
 */
const STATUS_HELP: Record<RiskStatus, string> = {
  open: 'Back to open. Any resolved timestamp is cleared -- a reopened risk carrying the time it was resolved reads as closed to anything checking that column.',
  mitigating: 'Someone is working on it. Still counted as live.',
  resolved:
    'The situation changed. Stamps a resolved time, and frees the detector to raise this risk type again later -- a stall that recurs in December is a new stall.',
  dismissed:
    'A human decided it does not matter. Deliberately not "resolved": nothing was fixed, and conflating the two would corrupt any measure of how many risks actually got addressed.',
}

/**
 * Task 6.5: change a risk's status.
 *
 * Only `status` is writable, and the restriction is the point -- `risk_type`,
 * `title`, `description`, `severity` and `confidence` belong to the detector,
 * and editing them would destroy the record of what it actually asserted. So
 * there is no "edit risk" form anywhere in this screen: if a risk is wrong,
 * the honest move is to dismiss it, which keeps the claim and records the
 * disagreement.
 */
export function RiskStatusControl({ risk, busy, error, onSubmit }: RiskStatusControlProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<RiskStatus>(risk.status)
  const [note, setNote] = useState('')

  const options: RiskStatus[] = ['open', 'mitigating', 'resolved', 'dismissed']

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Change status
      </Button>

      {open && (
        <Drawer
          open
          onClose={() => setOpen(false)}
          title="Change risk status"
          description={risk.title}
          footer={
            <>
              <Button onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={status === risk.status}
                onClick={() => onSubmit({ status, note: note.trim() || null })}
              >
                Save
              </Button>
            </>
          }
        >
          <form className="ui-stack" onSubmit={(event) => event.preventDefault()}>
            {error ? <div className="ui-callout ui-callout--danger">{errorMessage(error)}</div> : null}

            <fieldset className="dismiss__reasons">
              <legend className="ui-field__label">Status</legend>
              {options.map((value) => (
                <label key={value} className="dismiss__reason">
                  <input
                    type="radio"
                    name="risk-status"
                    value={value}
                    checked={status === value}
                    onChange={() => setStatus(value)}
                  />
                  <span>
                    <span className="dismiss__reason-name">
                      {humanise(value)}
                      {value === risk.status && (
                        <span className="ui-muted dismiss__reason-current"> &middot; current</span>
                      )}
                    </span>
                    <span className="dismiss__reason-help">{STATUS_HELP[value]}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <TextAreaField
              label="Note"
              optional
              value={note}
              hint="Recorded against the decision, not against the claim."
              onChange={(event) => setNote(event.target.value)}
            />
          </form>
        </Drawer>
      )}
    </>
  )
}
