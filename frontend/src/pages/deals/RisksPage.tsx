import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { keys, recommendations, risks } from '../../lib/queries'
import type {
  RecommendationAccept,
  RecommendationDetail,
  RecommendationDismiss,
  RiskListItem,
  RiskUpdate,
  Severity,
} from '../../lib/types'
import { formatRelative, humanise } from '../../lib/format'
import { errorMessage } from '../../lib/errorMessage'
import type { BadgeTone } from '../../components/ui/Badge'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingBlock, useToast } from '../../components/ui'
import { EvidenceDrawer, useEvidence } from '../../components/evidence'
import { useDeal } from './dealContext'
import { AcceptDialog } from './AcceptDialog'
import { DismissDialog } from './DismissDialog'
import { RecommendationCard } from './RecommendationCard'
import { RiskStatusControl } from './RiskStatusControl'
import './deals.css'

/**
 * Widen a risk's nested `RecommendationSummary` into a full
 * `RecommendationDetail`.
 *
 * The risk list embeds a summary -- enough to render the card -- while the
 * accept and dismiss dialogs take the detail shape. The missing fields are
 * genuinely absent from the summary rather than unknown, so they are filled
 * from the risk that owns it (`deal_id`, `source_risk_id`, `origin`) or left
 * null, and `confidence` stays null because a card must never render it
 * anyway (5.6).
 */
function widen(risk: RiskListItem, dealId: string): RecommendationDetail {
  return {
    ...risk.recommendation!,
    deal_id: dealId,
    source_risk_id: risk.id,
    description: null,
    confidence: null,
    origin: risk.origin,
    dismissal_note: null,
    generated_at: risk.first_detected_at,
    decided_at: null,
  }
}

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
 * Phase 6. The product.
 *
 * Everything before this was plumbing to make this screen trustworthy, and
 * the structure follows from one rule: **nothing here changes a row without a
 * human pressing something.** `risk -> recommendation -> [human accepts] ->
 * task` is the whole shape of the thing, so both decision buttons open a
 * dialog that demands an input the suggestion cannot supply -- a due date, or
 * a reason.
 *
 * Two stacked sections, as the plan lays out. Risks come first with their
 * recommendation nested, because two parallel lists would make someone read
 * "no economic buyer" in one panel and "engage a stakeholder" in another and
 * work out that they are the same thing. The second section is only the
 * *proactive* recommendations -- the ones with no `source_risk_id`, which the
 * risk panel structurally cannot show.
 */
export function RisksPage() {
  const deal = useDeal()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { target, openEvidence, closeEvidence } = useEvidence()

  const [accepting, setAccepting] = useState<RecommendationDetail | null>(null)
  const [dismissing, setDismissing] = useState<RecommendationDetail | null>(null)
  const [showDecided, setShowDecided] = useState(false)

  const riskList = useQuery({
    queryKey: keys.risks(deal.id),
    queryFn: () => risks.list(deal.id),
  })

  const recList = useQuery({
    queryKey: keys.recommendations(deal.id),
    queryFn: () => recommendations.list(deal.id),
  })

  /**
   * Task 6.4: accepting writes a task, so `['tasks']` is invalidated too.
   *
   * And `['deals', dealId]` for the header, whose `open_risks` and
   * `open_tasks` counts both move. The deal's analysis state is left alone --
   * a human decision does not mark the deal dirty.
   */
  const invalidateDecision = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.risks(deal.id) }),
      queryClient.invalidateQueries({ queryKey: keys.recommendations(deal.id) }),
      queryClient.invalidateQueries({ queryKey: keys.deal(deal.id) }),
      queryClient.invalidateQueries({ queryKey: keys.tasks() }),
    ])

  const accept = useMutation({
    mutationFn: ({ recId, body }: { recId: string; body: RecommendationAccept }) =>
      recommendations.accept(deal.id, recId, body),
    onSuccess: async (rec) => {
      await invalidateDecision()
      setAccepting(null)
      toast.success(`Created a task from "${rec.title}".`)
    },
    // No toast on failure: the 409s name what already happened and belong in
    // the dialog, which keeps them beside the button that was refused.
  })

  const dismiss = useMutation({
    mutationFn: ({ recId, body }: { recId: string; body: RecommendationDismiss }) =>
      recommendations.dismiss(deal.id, recId, body),
    onSuccess: async () => {
      await invalidateDecision()
      setDismissing(null)
      toast.success('Dismissed. The detector will not suggest it again.')
    },
  })

  const updateRisk = useMutation({
    mutationFn: ({ riskId, body }: { riskId: string; body: RiskUpdate }) =>
      risks.updateStatus(deal.id, riskId, body),
    onSuccess: async (risk) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.risks(deal.id) }),
        queryClient.invalidateQueries({ queryKey: keys.deal(deal.id) }),
      ])
      toast.success(`Risk marked ${humanise(risk.status).toLowerCase()}.`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const allRisks = riskList.data ?? []
  const liveRisks = allRisks.filter((r) => r.status === 'open' || r.status === 'mitigating')
  const closedRisks = allRisks.filter((r) => r.status !== 'open' && r.status !== 'mitigating')
  const shownRisks = showDecided ? allRisks : liveRisks

  // Only the proactive ones. The rest are nested in their risk cards, and
  // showing them twice would double every suggestion on the page.
  const proactive = (recList.data ?? []).filter((r) => r.source_risk_id === null)

  return (
    <div className="ui-stack">
      <Card
        title="Risks"
        description="Live risks first, then worst first. Each one carries the evidence it rests on."
        actions={
          closedRisks.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setShowDecided((v) => !v)}>
              {showDecided
                ? 'Hide decided'
                : `Show ${closedRisks.length} decided`}
            </Button>
          ) : undefined
        }
        flush
      >
        {riskList.isPending ? (
          <LoadingBlock label="Loading risks..." />
        ) : riskList.isError ? (
          <ErrorState error={riskList.error} onRetry={riskList.refetch} />
        ) : shownRisks.length === 0 ? (
          /* Task 6.7. An empty list is good news and never means "AI is off":
             six of the ten risk types are deterministic joins over tables
             that already exist and run with no model call at all. So the
             copy says what an empty list *does* mean rather than leaving
             someone to wonder whether anything ran. */
          <EmptyState
            title={allRisks.length === 0 ? 'No risks detected' : 'No live risks'}
            body={
              allRisks.length === 0
                ? 'That is good news, not a missing feature. Most of these checks are deterministic joins over existing records and need no model, so an empty list means the checks ran and found nothing.'
                : 'Every detected risk has been resolved or dismissed.'
            }
            actions={
              closedRisks.length > 0 && !showDecided ? (
                <Button size="sm" onClick={() => setShowDecided(true)}>
                  Show {closedRisks.length} decided
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="risk-list">
            {shownRisks.map((risk) => (
              <li
                key={risk.id}
                className={`risk-card${risk.status === 'open' || risk.status === 'mitigating' ? '' : ' is-closed'}`}
              >
                <div className="risk-card__head">
                  <Badge tone={severityTone(risk.severity)}>{humanise(risk.severity)}</Badge>
                  <Badge tone={risk.status === 'open' || risk.status === 'mitigating' ? 'neutral' : 'ok'}>
                    {humanise(risk.status)}
                  </Badge>
                  <Badge
                    tone="neutral"
                    title={`Written by ${risk.origin === 'ai' ? 'the model or detector' : 'a person'}`}
                  >
                    {risk.origin === 'ai' ? 'detected' : 'manual'}
                  </Badge>
                  {/* `risk_type` is `other` when the model named the risk
                      itself. `risk_key` holds the slug but is not exposed in
                      any response schema, so the model-written `title` is
                      what identifies it -- which reads fine, and is why this
                      renders like any other card. */}
                  <span className="ui-muted risk-card__type">
                    {risk.risk_type === 'other' ? 'model-named' : humanise(risk.risk_type)}
                  </span>
                </div>

                <h3 className="risk-card__title">{risk.title}</h3>
                {risk.description && <p className="risk-card__body">{risk.description}</p>}

                {risk.recommendation && (
                  <RecommendationCard
                    recommendation={
                      {
                        ...risk.recommendation,
                        deal_id: deal.id,
                        source_risk_id: risk.id,
                        description: null,
                        confidence: null,
                        origin: risk.origin,
                        dismissal_note: null,
                        generated_at: risk.first_detected_at,
                        decided_at: null,
                      } as RecommendationDetail
                    }
                    onAccept={() =>
                      setAccepting(widen(risk, deal.id))
                    }
                    onDismiss={() =>
                      setDismissing(widen(risk, deal.id))
                    }
                  />
                )}

                <div className="risk-card__foot">
                  {/* Task 6.1: the evidence button, on every card. A zero
                      count is shown as a refusal rather than hidden -- a
                      risk with no citations is asserting something uncited,
                      which is the one thing this product must not do
                      quietly. */}
                  {risk.evidence_count > 0 ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        openEvidence({
                          dealId: deal.id,
                          claimType: 'risk',
                          claimId: risk.id,
                          claimTitle: risk.title,
                        })
                      }
                    >
                      {risk.evidence_count} source{risk.evidence_count === 1 ? '' : 's'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        openEvidence({
                          dealId: deal.id,
                          claimType: 'risk',
                          claimId: risk.id,
                          claimTitle: risk.title,
                        })
                      }
                    >
                      No evidence
                    </Button>
                  )}

                  <RiskStatusControl
                    risk={risk}
                    busy={updateRisk.isPending}
                    error={updateRisk.error}
                    onSubmit={(body) => updateRisk.mutate({ riskId: risk.id, body })}
                  />

                  <span className="ui-muted risk-card__seen">
                    first seen {formatRelative(risk.first_detected_at)} &middot; last confirmed{' '}
                    {formatRelative(risk.last_seen_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* The proactive recommendations. A second section rather than a second
          list of everything: anything with a `source_risk_id` is already
          above, inside the risk it belongs to. */}
      {recList.isError ? (
        <Card title="Recommendations">
          <ErrorState error={recList.error} onRetry={recList.refetch} />
        </Card>
      ) : proactive.length > 0 ? (
        <Card
          title="Other suggestions"
          description="Not tied to a detected risk, so they appear nowhere above."
          flush
        >
          <div className="rec-list">
            {proactive.map((rec) => (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
                showEvidence
                onShowEvidence={() =>
                  openEvidence({
                    dealId: deal.id,
                    claimType: 'recommendation',
                    claimId: rec.id,
                    claimTitle: rec.title,
                  })
                }
                onAccept={() => setAccepting(rec)}
                onDismiss={() => setDismissing(rec)}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {accepting && (
        <AcceptDialog
          recommendation={accepting}
          busy={accept.isPending}
          error={accept.error}
          onSubmit={(body) => accept.mutate({ recId: accepting.id, body })}
          onClose={() => {
            setAccepting(null)
            accept.reset()
          }}
        />
      )}

      {dismissing && (
        <DismissDialog
          recommendation={dismissing}
          busy={dismiss.isPending}
          error={dismiss.error}
          onSubmit={(body) => dismiss.mutate({ recId: dismissing.id, body })}
          onClose={() => {
            setDismissing(null)
            dismiss.reset()
          }}
        />
      )}

      <EvidenceDrawer target={target} onClose={closeEvidence} />
    </div>
  )
}
