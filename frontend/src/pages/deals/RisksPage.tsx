import { useQuery } from '@tanstack/react-query'
import { keys, risks } from '../../lib/queries'
import type { RiskListItem, Severity } from '../../lib/types'
import { formatRelative, humanise } from '../../lib/format'
import type { BadgeTone } from '../../components/ui/Badge'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock } from '../../components/ui'
import { EvidenceDrawer, useEvidence } from '../../components/evidence'
import { useDeal } from './dealContext'
import './deals.css'

/**
 * Severity -> tone. `critical` and `high` both read as danger because both
 * mean "deal is at risk"; the label carries the degree.
 */
function severityTone(severity: Severity): BadgeTone {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'danger'
    case 'medium':
      return 'warn'
    default:
      return 'neutral'
  }
}

/**
 * A read-only risk list, built to give phase 5 a call site.
 *
 * **This is not phase 6.** The plan puts the evidence drawer before risks
 * deliberately, which leaves the drawer with nothing to open it -- and an
 * unexercised component is one nobody has checked. So this renders the risks
 * and their evidence buttons, and stops there: no accept, no dismiss, no
 * status change, no recommendation decisions. Phase 6 adds all of that, plus
 * the `correct_record` distinction and the dismissal-reason dialog, and will
 * replace this file rather than extend it.
 *
 * Two things here are phase-6 rules that would be wrong to break even in a
 * placeholder:
 *
 * - **Nothing changes a row.** `risk -> recommendation -> [human accepts] ->
 *   task` is the product, so a read-only screen is a correct subset of it in
 *   a way an auto-accepting one would not be.
 * - **`confidence` is not rendered as a verdict** (5.6). It is the
 *   generator's own guess, and this screen shows the *evidence count* instead
 *   -- which is a fact about what backs the claim rather than an opinion
 *   about it.
 */
export function RisksPage() {
  const deal = useDeal()
  const { target, openEvidence, closeEvidence } = useEvidence()

  const list = useQuery({
    queryKey: keys.risks(deal.id),
    queryFn: () => risks.list(deal.id),
  })

  return (
    <div className="ui-stack">
      <div className="ui-callout ui-callout--info">
        <strong>Read-only for now.</strong> Phase 6 adds the decision controls -- accept a
        recommendation into a task, dismiss one with a reason, change a risk&rsquo;s status.
        This screen exists so the evidence drawer has somewhere to open from.
      </div>

      <Card
        title="Risks"
        description="Live risks first, then worst first. Open the evidence to see what each one rests on."
        flush
      >
        {list.isPending ? (
          <LoadingBlock label="Loading risks..." />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : list.data.length === 0 ? (
          /* Task 6.7, which is as much a phase-5 concern: an empty list is
             good news, and it never means "AI is off". The deterministic
             detector produces six of the ten risk types with no model calls
             at all, so it runs whether or not the AI layer is enabled. */
          <EmptyState
            title="No risks detected"
            body="That is good news, not a missing feature. Most of these checks are deterministic joins over existing records and need no model, so an empty list means the checks ran and found nothing."
          />
        ) : (
          <ul className="risk-list">
            {list.data.map((risk) => (
              <RiskCard
                key={risk.id}
                risk={risk}
                onShowEvidence={() =>
                  openEvidence({
                    dealId: deal.id,
                    claimType: 'risk',
                    claimId: risk.id,
                    claimTitle: risk.title,
                  })
                }
              />
            ))}
          </ul>
        )}
      </Card>

      <EvidenceDrawer target={target} onClose={closeEvidence} />
    </div>
  )
}

function RiskCard({
  risk,
  onShowEvidence,
}: {
  risk: RiskListItem
  onShowEvidence: () => void
}) {
  const live = risk.status === 'open' || risk.status === 'mitigating'

  return (
    <li className={`risk-card${live ? '' : ' is-closed'}`}>
      <div className="risk-card__head">
        <Badge tone={severityTone(risk.severity)}>{humanise(risk.severity)}</Badge>
        <Badge tone={live ? 'neutral' : 'ok'}>{humanise(risk.status)}</Badge>
        {/* `origin` is the answer to "how much of this did the model write?",
            which is the first question asked the moment someone stops
            trusting the output. */}
        <Badge tone="neutral" title={`Written by ${risk.origin === 'ai' ? 'the model' : 'a person'}`}>
          {risk.origin === 'ai' ? 'detected' : 'manual'}
        </Badge>
        <span className="ui-muted risk-card__type">{humanise(risk.risk_type)}</span>
      </div>

      <h3 className="risk-card__title">{risk.title}</h3>
      {risk.description && <p className="risk-card__body">{risk.description}</p>}

      {risk.recommendation && (
        <div className="risk-card__rec">
          <span className="ui-muted risk-card__rec-label">Suggested</span>
          <div>
            <div className="risk-card__rec-title">{risk.recommendation.title}</div>
            {risk.recommendation.rationale && (
              <p className="risk-card__rec-rationale">{risk.recommendation.rationale}</p>
            )}
          </div>
        </div>
      )}

      <div className="risk-card__foot">
        {/* The evidence button is the point of this screen, so it is the
            primary action and it states the count -- a card with zero
            citations is asserting something uncited, and that should be
            visible without opening the drawer. */}
        {risk.evidence_count > 0 ? (
          <Button size="sm" onClick={onShowEvidence}>
            {risk.evidence_count} source{risk.evidence_count === 1 ? '' : 's'}
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={onShowEvidence}>
            No evidence
          </Button>
        )}
        <span className="ui-muted risk-card__seen">
          first seen {formatRelative(risk.first_detected_at)} &middot; last confirmed{' '}
          {formatRelative(risk.last_seen_at)}
        </span>
      </div>
    </li>
  )
}
