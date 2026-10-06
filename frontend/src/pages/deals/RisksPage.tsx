import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { keys, recommendations, risks } from '../../lib/queries'
import { SEVERITIES } from '../../lib/types'
import type {
  RecommendationAccept,
  RecommendationDetail,
  RecommendationDismiss,
  RiskListItem,
  RiskUpdate,
  Severity,
} from '../../lib/types'
import { formatDateTime, formatRelative, humanise } from '../../lib/format'
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

const isLive = (r: RiskListItem) => r.status === 'open' || r.status === 'mitigating'

/**
 * Phase 6, restructured the same way the Facts tab was.
 *
 * The content was right and the hierarchy was wrong. Every card led with four
 * badges before the thing you actually read; the evidence button sat at the
 * bottom with the same weight as a status menu; and nothing on the screen said
 * what accepting or dismissing would *do* -- so the two controls that write
 * rows looked like filters.
 *
 * Four changes, each moving information to where it earns its place:
 *
 * 1. **What the screen is, said once.** The chain this product rests on
 *    (`risk -> recommendation -> you accept -> task`) was documented in code
 *    comments and nowhere a user could see it.
 * 2. **Severity becomes triage.** Counts as filter chips, so "two high and one
 *    critical" is legible before reading a single card.
 * 3. **Evidence is promoted to the primary action.** It is the trust anchor of
 *    the whole product and it was the third control on the row.
 * 4. **Badge noise cut.** `origin` appeared on every card reading "detected",
 *    which is the default and therefore not information; it now shows only for
 *    the exception, and the same for `open`. Timestamps moved behind "Why",
 *    which is where detail that matters once belongs.
 */
export function RisksPage() {
  const deal = useDeal()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { target, openEvidence, closeEvidence } = useEvidence()

  const [accepting, setAccepting] = useState<RecommendationDetail | null>(null)
  const [dismissing, setDismissing] = useState<RecommendationDetail | null>(null)
  const [severityFilter, setSeverityFilter] = useState<Severity | null>(null)
  /**
   * Arrived from a task's "from a suggestion" link?
   *
   * Then the target recommendation must be on screen, and it may be nested in a
   * risk that was since resolved -- which this toggle hides by default. Read
   * from the hash as lazy initial state rather than in an effect, to stay clear
   * of the `set-state-in-effect` rule.
   */
  const [showDecided, setShowDecided] = useState(
    () => typeof window !== 'undefined' && window.location.hash.startsWith('#rec-'),
  )

  const riskList = useQuery({
    queryKey: keys.risks(deal.id),
    queryFn: () => risks.list(deal.id),
  })

  const recList = useQuery({
    queryKey: keys.recommendations(deal.id),
    queryFn: () => recommendations.list(deal.id),
  })

  /**
   * Scroll a linked recommendation into view.
   *
   * A browser scrolls to a hash on a real navigation, but an SPA route change
   * resolves before the data does, so by the time the card exists the moment
   * has passed. A DOM side effect, which is what effects are for.
   */
  useEffect(() => {
    if (!riskList.isSuccess && !recList.isSuccess) return
    const hash = window.location.hash
    if (!hash.startsWith('#rec-')) return
    const el = document.getElementById(hash.slice(1))
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('is-linked')
  }, [riskList.isSuccess, recList.isSuccess])

  /** Accepting writes a task, so `['tasks']` is invalidated too. */
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
    // the dialog, beside the button that was refused.
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

  const all = riskList.data ?? []
  const live = all.filter(isLive)
  const closed = all.filter((r) => !isLive(r))
  const bySeverity = (s: Severity) => live.filter((r) => r.severity === s).length
  const uncited = live.filter((r) => r.evidence_count === 0).length
  const awaiting = (recList.data ?? []).filter((r) => r.status === 'suggested').length

  const pool = showDecided ? all : live
  const shown = severityFilter ? pool.filter((r) => r.severity === severityFilter) : pool
  // Only the proactive ones. The rest are nested in their risk cards, and
  // showing them twice would double every suggestion on the page.
  const proactive = (recList.data ?? []).filter((r) => r.source_risk_id === null)

  return (
    <div className="ui-stack">
      {/* Said once. These two paragraphs previously existed only in code
          comments, which is the wrong audience for them. */}
      <Card
        title="What this screen is"
        description="The detector finds problems and suggests what to do. You decide what becomes work."
      >
        <div className="facts-legend">
          <div>
            <h4 className="brief__heading">Nothing here changes on its own</h4>
            <p className="facts-legend__body">
              A risk is a problem the detector found; below it sits the action it suggests.{' '}
              <strong>Accepting</strong> turns that suggestion into a real task with a due
              date you set &mdash; it is the only control on this page that creates work.{' '}
              <strong>Dismissing</strong> records why you said no, which is what stops the
              detector raising it again, so the reason is a real input rather than a shrug.
            </p>
          </div>
          <div>
            <h4 className="brief__heading">An empty list is good news</h4>
            <p className="facts-legend__body">
              Six of the ten checks are plain database queries needing no model at all, so
              they run whether or not the AI layer is on. Nothing listed means the checks
              ran and found nothing &mdash; it never means the analysis is switched off.
              Every card carries the evidence it rests on; open it before acting.
            </p>
          </div>
        </div>

        {uncited > 0 && (
          /* A risk with no citations asserts something uncited, which is the
             one thing this product must not do quietly. A count here, and red
             on the card itself. */
          <div className="ui-callout ui-callout--danger facts-legend__note">
            <strong>
              {uncited} live {uncited === 1 ? 'risk has' : 'risks have'} no evidence recorded.
            </strong>{' '}
            That is a defect rather than a quiet absence &mdash; nothing currently backs the
            claim, and Gate 0 should have caught it on insert.
          </div>
        )}
      </Card>

      {riskList.isPending ? (
        <Card>
          <LoadingBlock label="Loading risks..." />
        </Card>
      ) : riskList.isError ? (
        <Card>
          <ErrorState error={riskList.error} onRetry={riskList.refetch} />
        </Card>
      ) : (
        <>
          {live.length > 0 && (
            /* Triage. Severity was a badge you had to read card by card; as
               chips with counts the shape of the deal is legible at a glance. */
            <div className="facts-chips">
              <button
                type="button"
                className={`facts-chip${severityFilter === null ? ' is-active' : ''}`}
                onClick={() => setSeverityFilter(null)}
              >
                All live <span className="facts-chip__count">{live.length}</span>
              </button>
              {[...SEVERITIES].reverse().map((s) =>
                bySeverity(s) > 0 ? (
                  <button
                    key={s}
                    type="button"
                    className={`facts-chip${severityFilter === s ? ' is-active' : ''}`}
                    onClick={() => setSeverityFilter(severityFilter === s ? null : s)}
                  >
                    {humanise(s)} <span className="facts-chip__count">{bySeverity(s)}</span>
                  </button>
                ) : null,
              )}
              {closed.length > 0 && (
                <button
                  type="button"
                  className={`facts-chip${showDecided ? ' is-active' : ''}`}
                  onClick={() => setShowDecided((v) => !v)}
                >
                  Include decided <span className="facts-chip__count">{closed.length}</span>
                </button>
              )}
            </div>
          )}

          <Card
            title={
              live.length > 0
                ? `${live.length} live ${live.length === 1 ? 'risk' : 'risks'}`
                : 'No live risks'
            }
            description={
              awaiting > 0
                ? `${awaiting} suggestion${awaiting === 1 ? '' : 's'} awaiting your decision. Worst first.`
                : 'Worst first. Nothing is awaiting a decision.'
            }
            flush
          >
            {shown.length === 0 ? (
              /* Task 6.7. An empty list is good news and never means "AI is
                 off" -- six of the ten risk types need no model at all. */
              <EmptyState
                title={all.length === 0 ? 'No risks detected' : 'Nothing matches'}
                body={
                  all.length === 0
                    ? 'The checks ran and found nothing. Most of them are deterministic queries over records that already exist, so this is a real result rather than a missing feature.'
                    : severityFilter
                      ? `No live ${severityFilter} risks.`
                      : 'Every detected risk has been resolved or dismissed.'
                }
                actions={
                  closed.length > 0 && !showDecided ? (
                    <Button size="sm" onClick={() => setShowDecided(true)}>
                      Show {closed.length} decided
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="risk-list">
                {shown.map((risk) => (
                  <RiskCard
                    key={risk.id}
                    risk={risk}
                    dealId={deal.id}
                    busy={updateRisk.isPending}
                    error={updateRisk.error}
                    onEvidence={() =>
                      openEvidence({
                        dealId: deal.id,
                        claimType: 'risk',
                        claimId: risk.id,
                        claimTitle: risk.title,
                      })
                    }
                    onStatus={(body) => updateRisk.mutate({ riskId: risk.id, body })}
                    onAccept={() => setAccepting(widen(risk, deal.id))}
                    onDismiss={() => setDismissing(widen(risk, deal.id))}
                  />
                ))}
              </ul>
            )}
          </Card>

          {recList.isError ? (
            <Card title="Other suggestions">
              <ErrorState error={recList.error} onRetry={recList.refetch} />
            </Card>
          ) : proactive.length > 0 ? (
            <Card
              title="Other suggestions"
              description="Advice not tied to a detected problem, so it appears under no risk above."
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
        </>
      )}

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

function RiskCard({
  risk,
  dealId,
  busy,
  error,
  onEvidence,
  onStatus,
  onAccept,
  onDismiss,
}: {
  risk: RiskListItem
  dealId: string
  busy: boolean
  error: unknown
  onEvidence: () => void
  onStatus: (body: RiskUpdate) => void
  onAccept: () => void
  onDismiss: () => void
}) {
  const [open, setOpen] = useState(false)
  const live = isLive(risk)

  return (
    <li className={`risk-card risk-card--${risk.severity}${live ? '' : ' is-closed'}`}>
      <div className="risk-card__main">
        {/* The title leads. It used to sit below four badges. */}
        <h3 className="risk-card__title">{risk.title}</h3>

        <div className="risk-card__head">
          <Badge tone={severityTone(risk.severity)}>{humanise(risk.severity)}</Badge>
          {/* `open` is the default and says nothing, so only a moved status
              shows. Same for `detected`, which was on every single card. */}
          {risk.status !== 'open' && (
            <Badge tone={live ? 'info' : 'ok'}>{humanise(risk.status)}</Badge>
          )}
          {risk.origin !== 'ai' && (
            <Badge tone="neutral" title="Recorded by a person, not the detector.">
              added by hand
            </Badge>
          )}
          <span className="ui-muted risk-card__type">
            {/* `risk_type` is `other` when the model named the risk itself.
                `risk_key` holds the slug but no response schema returns it, so
                the model-written title is what identifies it. */}
            {risk.risk_type === 'other' ? 'model-named' : humanise(risk.risk_type)}
          </span>
        </div>

        {risk.description && <p className="risk-card__body">{risk.description}</p>}

        {risk.recommendation && (
          <RecommendationCard
            recommendation={widen(risk, dealId)}
            onAccept={onAccept}
            onDismiss={onDismiss}
          />
        )}

        {open && (
          <dl className="fact__meta risk-card__detail">
            <div>
              <dt>First detected</dt>
              <dd>{formatDateTime(risk.first_detected_at)}</dd>
            </div>
            <div>
              <dt>Last confirmed</dt>
              <dd>{formatRelative(risk.last_seen_at)}</dd>
            </div>
            {risk.resolved_at && (
              <div>
                <dt>Resolved</dt>
                <dd>{formatDateTime(risk.resolved_at)}</dd>
              </div>
            )}
            <div>
              <dt>Check</dt>
              <dd>{risk.risk_type}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="risk-card__actions">
        {/* Promoted to primary. The product's whole claim is that nothing is
            asserted without a path back to what backs it, which makes this the
            most important button on the page -- and it was the third. */}
        {risk.evidence_count > 0 ? (
          <Button size="sm" variant="primary" onClick={onEvidence}>
            {risk.evidence_count} source{risk.evidence_count === 1 ? '' : 's'}
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={onEvidence}>
            No evidence
          </Button>
        )}
        <RiskStatusControl risk={risk} busy={busy} error={error} onSubmit={onStatus} />
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Less' : 'Why'}
        </Button>
      </div>
    </li>
  )
}
