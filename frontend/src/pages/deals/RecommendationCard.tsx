import { Link } from 'react-router'
import { isCorrectRecord } from '../../lib/types'
import type { RecommendationDetail } from '../../lib/types'
import { formatDateTime, humanise } from '../../lib/format'
import type { BadgeTone } from '../../components/ui/Badge'
import { Badge, Button } from '../../components/ui'

export interface RecommendationCardProps {
  recommendation: RecommendationDetail
  /** Hidden inside a risk card, where the risk already owns the button. */
  showEvidence?: boolean
  onShowEvidence?: () => void
  onAccept: () => void
  onDismiss: () => void
}

function priorityTone(priority: string): BadgeTone {
  switch (priority) {
    case 'urgent':
      return 'danger'
    case 'high':
      return 'warn'
    default:
      return 'neutral'
  }
}

/**
 * Task 6.2, and task 6.6 inside it.
 *
 * **`correct_record` reads differently and is rendered differently.** Every
 * other `action_type` names something to go and do; this one is a claim that
 * a row in our own database is wrong -- stage 7 of the pipeline concluding
 * that an open commitment now looks satisfied. The backend gave it its own
 * enum value rather than filing it under the nearest action precisely so that
 * distinction survives, so the card says "review this record" and the accept
 * button says "Create review task", not "Accept".
 *
 * Nothing on this card changes a row by itself. `risk -> recommendation ->
 * [human accepts] -> task` is the product, and both buttons open a dialog
 * that requires an input the suggestion cannot supply: a due date, or a
 * reason.
 */
export function RecommendationCard({
  recommendation: rec,
  showEvidence,
  onShowEvidence,
  onAccept,
  onDismiss,
}: RecommendationCardProps) {
  const correction = isCorrectRecord(rec.action_type)
  const decided = rec.status !== 'suggested'

  return (
    <div className={`rec-card${decided ? ' is-decided' : ''}${correction ? ' is-correction' : ''}`}>
      <div className="rec-card__head">
        <Badge tone={correction ? 'info' : 'accent'}>
          {correction ? 'Record correction' : humanise(rec.action_type)}
        </Badge>
        <Badge tone={priorityTone(rec.priority)}>{humanise(rec.priority)}</Badge>
        {rec.status === 'accepted' && <Badge tone="ok">Accepted</Badge>}
        {rec.status === 'completed' && <Badge tone="ok">Completed</Badge>}
        {rec.status === 'dismissed' && <Badge tone="neutral">Dismissed</Badge>}
        {/* A proactive recommendation nests under no risk, which is the one
            thing the risk panel cannot show -- so it is labelled where it
            does appear. */}
        {rec.source_risk_id === null && (
          <Badge tone="neutral" title="Not tied to a detected risk.">
            proactive
          </Badge>
        )}
      </div>

      <h4 className="rec-card__title">{rec.title}</h4>

      {correction ? (
        /* Not a to-do. The wording has to carry that, because the title of a
           `correct_record` row reads like an instruction ("mark the SOC 2
           commitment complete") and acting on it without checking is exactly
           the mistake this phrasing exists to prevent. */
        <p className="rec-card__correction">
          The analysis believes a record is out of date. <strong>Review it</strong> rather
          than treating this as work to do -- nothing has been changed.
        </p>
      ) : null}

      {rec.description && <p className="rec-card__body">{rec.description}</p>}
      {rec.rationale && rec.rationale !== rec.description && (
        <p className="rec-card__rationale">{rec.rationale}</p>
      )}

      {rec.status === 'dismissed' && (
        <div className="rec-card__decision">
          Dismissed as <strong>{humanise(rec.dismissal_reason)}</strong>
          {rec.decided_at && <span className="ui-muted"> on {formatDateTime(rec.decided_at)}</span>}
          {rec.dismissal_note && <p className="rec-card__note">{rec.dismissal_note}</p>}
        </div>
      )}

      {(rec.status === 'accepted' || rec.status === 'completed') && (
        <div className="rec-card__decision">
          {/* The payoff of this phase, stated on the card: the suggestion
              became a real piece of work, and here it is. */}
          Became a task
          {rec.created_task_id && (
            <>
              {' '}
              &mdash; <Link to="/tasks">see it in Tasks</Link>
            </>
          )}
          {rec.is_completed && <strong> (done)</strong>}
          {rec.decided_at && (
            <span className="ui-muted"> &middot; accepted {formatDateTime(rec.decided_at)}</span>
          )}
        </div>
      )}

      <div className="rec-card__foot">
        {!decided && (
          <>
            <Button size="sm" variant="primary" onClick={onAccept}>
              {correction ? 'Create review task' : 'Accept'}
            </Button>
            <Button size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </>
        )}
        {showEvidence && onShowEvidence && (
          <Button size="sm" variant="ghost" onClick={onShowEvidence}>
            Evidence
          </Button>
        )}
      </div>
    </div>
  )
}
