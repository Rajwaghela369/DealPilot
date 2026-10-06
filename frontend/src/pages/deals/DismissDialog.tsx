import { useState } from 'react'
import { ApiError } from '../../lib/api'
import { DISMISSAL_REASONS } from '../../lib/types'
import type { DismissalReason, RecommendationDetail, RecommendationDismiss } from '../../lib/types'
import { Button, Drawer, TextAreaField } from '../../components/ui'

export interface DismissDialogProps {
  recommendation: RecommendationDetail
  busy?: boolean
  error?: unknown
  onSubmit: (body: RecommendationDismiss) => void
  onClose: () => void
}

/**
 * What each reason means, in the user's terms.
 *
 * Written out rather than left as humanised slugs because the choice is a
 * real input, not a label: the value feeds the detector's suppression logic,
 * and the distribution across these five is the only signal that says whether
 * the advice is any good. "40% `wrong`" means the detector needs work; "40%
 * `already_handled`" means it is right but late. Those lead to opposite
 * decisions, so picking the wrong one here actively misinforms.
 */
const REASON_HELP: Record<DismissalReason, string> = {
  already_handled: 'The suggestion is right, but this is already done or in hand.',
  not_relevant: 'Correct about the facts, but it does not matter on this deal.',
  wrong: 'The claim behind it is not true. This is the one that says the detector is at fault.',
  bad_timing: 'Right thing, wrong moment -- worth revisiting later.',
  other: 'None of the above. Please say why in the note.',
}

/**
 * Task 6.3: dismiss with a reason.
 *
 * **Five reasons, not the three the plan lists.** `bad_timing` and `other`
 * are real `DismissalReason` members and both are accepted by the API
 * (verified live). Leaving them out would force "revisit after the security
 * review" into `not_relevant`, which asserts the opposite of what the user
 * means -- and since these counts drive suppression, that is a data problem
 * rather than a cosmetic one.
 *
 * No default selection. A preselected reason is a reason nobody chose, and
 * the whole value of this field is that a human picked it.
 */
export function DismissDialog({
  recommendation,
  busy,
  error,
  onSubmit,
  onClose,
}: DismissDialogProps) {
  const [reason, setReason] = useState<DismissalReason | null>(null)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const handleSubmit = () => {
    if (!reason) {
      setProblem('Pick a reason -- it feeds the suppression logic, so it cannot be blank.')
      return
    }
    if (reason === 'other' && !note.trim()) {
      setProblem('"Other" needs a note, otherwise the dismissal records nothing usable.')
      return
    }
    onSubmit({ reason, note: note.trim() || null })
  }

  const conflict = error instanceof ApiError && error.status === 409 ? error.message : null

  return (
    <Drawer
      open
      onClose={onClose}
      title="Dismiss this suggestion"
      description={recommendation.title}
      footer={
        conflict ? (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleSubmit} loading={busy}>
              Dismiss
            </Button>
          </>
        )
      }
    >
      {conflict ? (
        <div className="ui-callout ui-callout--warn">{conflict}</div>
      ) : (
        <form
          className="ui-stack"
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmit()
          }}
        >
          {error instanceof ApiError && error.status !== 409 && (
            <div className="ui-callout ui-callout--danger">{error.message}</div>
          )}

          {/* Said plainly, because it changes how carefully someone picks:
              this is remembered, it stops the suggestion coming back, and it
              is the measure of whether the advice is worth anything. */}
          <p className="ui-muted dismiss__intro">
            This is recorded rather than deleted, and the reason is a real input rather
            than telemetry: it feeds the detector&rsquo;s suppression logic, so it is what
            stops this coming back. The spread across the five is also the only signal
            that says whether the advice is any good &mdash; so the accurate one matters.
          </p>

          <fieldset className="dismiss__reasons">
            <legend className="ui-field__label">Reason</legend>
            {DISMISSAL_REASONS.map((value) => (
              <label key={value} className="dismiss__reason">
                <input
                  type="radio"
                  name="dismissal-reason"
                  value={value}
                  checked={reason === value}
                  onChange={() => {
                    setReason(value)
                    setProblem(null)
                  }}
                />
                <span>
                  <span className="dismiss__reason-name">
                    {value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}
                  </span>
                  <span className="dismiss__reason-help">{REASON_HELP[value]}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <TextAreaField
            label="Note"
            optional={reason !== 'other'}
            value={note}
            placeholder="What a count cannot capture."
            error={problem ?? undefined}
            onChange={(event) => {
              setNote(event.target.value)
              setProblem(null)
            }}
          />
        </form>
      )}
    </Drawer>
  )
}
