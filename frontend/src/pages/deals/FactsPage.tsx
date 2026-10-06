import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { facts, keys } from '../../lib/queries'
import { FACT_TYPES, promotesOnAccept } from '../../lib/types'
import type { FactDecision, FactListItem, FactStatus, Verdict } from '../../lib/types'
import { formatRelative, humanise } from '../../lib/format'
import { errorMessage } from '../../lib/errorMessage'
import { verificationLabel } from '../../lib/verification'
import type { BadgeTone } from '../../components/ui/Badge'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  useToast,
} from '../../components/ui'
import { useDeal } from './dealContext'
import './facts.css'

/**
 * Gate 1's verdict -> badge.
 *
 * The only independently-checked trust signal the API exposes. `null` is "not
 * yet validated" and is neutral: the schema is explicit that absent is a
 * distinct state and is **not** defaulted to a pass, so it must not be green.
 */
function verdictLabel(verdict: Verdict | null): {
  tone: BadgeTone
  label: string
  help: string
} {
  switch (verdict) {
    case 'supported':
      return {
        tone: 'ok',
        label: 'Quote checks out',
        help: 'Gate 1 read the quote and the claim, and the quote supports it.',
      }
    case 'partial':
      return {
        tone: 'warn',
        label: 'Quote is thin',
        help: 'The quote backs part of this claim but not all of it -- usually because the span is too short to stand alone. The claim may still be right; the evidence does not fully carry it.',
      }
    case 'contradicted':
      return {
        tone: 'danger',
        label: 'Quote disagrees',
        help: 'The source says something incompatible with this claim.',
      }
    case 'unsupported':
      return {
        tone: 'danger',
        label: 'Quote does not back it',
        help: 'The quoted span does not support this claim at all.',
      }
    default:
      return {
        tone: 'neutral',
        label: 'Not checked',
        help: 'Gate 1 has not validated this one. Absent is not a pass.',
      }
  }
}

/**
 * Phase 9, rebuilt as a review queue now that Gate 3 exists.
 *
 * The first version was a flat list of near-identical rows, each repeating the
 * same sentence about self-reported confidence. With 27 facts that is 27 copies
 * of one caveat, which is how a screen becomes unreadable: the thing that
 * needed saying once was said so often it stopped being read.
 *
 * So this version says each general thing **once**, at the top, and gives each
 * row only what is specific to it. Three structural choices follow from that:
 *
 * 1. **Grouped by decision state, not by type.** The question this screen
 *    answers is "what is waiting for me", so undecided facts lead and decided
 *    ones collapse out of the way.
 * 2. **The claim is the headline.** It used to compete with three badges and a
 *    paragraph of disclaimer. The claim is what a person reads; everything else
 *    is metadata about it.
 * 3. **Evidence is one line, expandable.** It was a permanent blockquote on
 *    every row. The snippet is the evidence, so it stays visible -- the
 *    verification detail is what folds away.
 */
export function FactsPage() {
  const deal = useDeal()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [showDecided, setShowDecided] = useState(false)

  const list = useQuery({
    // Unfiltered: the type counts in the chip row have to reflect the whole
    // deal, and filtering client-side keeps them honest when one is selected.
    queryKey: keys.facts(deal.id),
    queryFn: () => facts.list(deal.id),
  })

  const decide = useMutation({
    mutationFn: ({ factId, body }: { factId: string; body: FactDecision }) =>
      facts.decide(deal.id, factId, body),
    onSuccess: async (fact) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.facts(deal.id) }),
        // Accepting is what makes a fact visible to the AI detector, so the
        // deal is now dirty and its badge is stale.
        queryClient.invalidateQueries({ queryKey: keys.dealAnalysis(deal.id) }),
        queryClient.invalidateQueries({ queryKey: keys.deal(deal.id) }),
      ])
      if (fact.promoted_to_type) {
        toast.success(`Accepted, and created a ${fact.promoted_to_type}.`)
      } else {
        toast.success(
          fact.status === 'accepted'
            ? 'Confirmed. The next analysis pass will take it into account.'
            : 'Rejected.',
        )
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const all = list.data ?? []
  const byType = (t: string) => all.filter((f) => f.fact_type === t).length
  const visible = typeFilter ? all.filter((f) => f.fact_type === typeFilter) : all

  const pending = visible.filter((f) => f.status === 'pending')
  const decided = visible.filter((f) => f.status !== 'pending')
  const thin = all.filter((f) => f.verdict === 'partial').length
  const unchecked = all.filter((f) => f.verdict === null).length

  return (
    <div className="ui-stack">
      {/* Everything general, said once. The per-row version of this is what
          made the old screen unreadable. */}
      <Card
        title="What this screen is"
        description="Extraction proposes; you decide. Nothing here is treated as true until you accept it."
      >
        <div className="facts-legend">
          <div>
            <h4 className="brief__heading">Accepting does one of two things</h4>
            <p className="facts-legend__body">
              A <strong>commitment</strong> becomes a real commitment record you can track
              and that the detector measures against. Every other kind is{' '}
              <strong>confirmed</strong> rather than promoted &mdash; there is no table a
              competitor or a budget figure belongs in. Confirming still matters: it is
              what puts the fact in front of the next analysis pass, which cannot see
              anything still undecided.
            </p>
          </div>
          <div>
            <h4 className="brief__heading">Two numbers, and only one is a check</h4>
            <p className="facts-legend__body">
              The badge on each row is <strong>Gate 1</strong>: an independent pass that
              re-reads the quote and asks whether it supports the claim. The{' '}
              <strong>confidence</strong> figure is the extractor&rsquo;s own guess about
              its own output &mdash; on this deal every single fact reports the maximum, so
              it carries no information. It is shown for completeness and is never a
              verdict.
            </p>
          </div>
        </div>

        {(thin > 0 || unchecked > 0) && (
          <div className="ui-callout ui-callout--info facts-legend__note">
            {thin > 0 && (
              <>
                <strong>{thin} of {all.length} have a thin quote.</strong> That usually
                means the extractor cited a fragment rather than the full sentence &mdash;
                the claim is often right while the evidence does not carry it on its own.
                Read the quote before accepting.{' '}
              </>
            )}
            {unchecked > 0 && <>{unchecked} have not been checked by Gate 1 at all.</>}
          </div>
        )}
      </Card>

      {list.isPending ? (
        <Card>
          <LoadingBlock label="Loading facts..." />
        </Card>
      ) : list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={list.refetch} />
        </Card>
      ) : all.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing extracted yet"
            body="Extraction runs over a meeting's transcript. Upload one on the Documents tab, attach it to a meeting, and analyse that meeting."
          />
        </Card>
      ) : (
        <>
          {/* Chips rather than a select: they carry their own counts, which is
              the information a reviewer actually wants from a filter. */}
          <div className="facts-chips">
            <button
              type="button"
              className={`facts-chip${typeFilter === null ? ' is-active' : ''}`}
              onClick={() => setTypeFilter(null)}
            >
              All <span className="facts-chip__count">{all.length}</span>
            </button>
            {FACT_TYPES.filter((t) => byType(t) > 0).map((t) => (
              <button
                key={t}
                type="button"
                className={`facts-chip${typeFilter === t ? ' is-active' : ''}`}
                onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              >
                {humanise(t)} <span className="facts-chip__count">{byType(t)}</span>
              </button>
            ))}
          </div>

          <Card
            title={pending.length > 0 ? `${pending.length} waiting for you` : 'Nothing waiting'}
            description={
              pending.length > 0
                ? 'Read the quote, then decide. Rejecting is not destructive -- the row and its evidence are kept.'
                : 'Every extracted fact on this deal has been decided.'
            }
            flush
          >
            {pending.length === 0 ? (
              <EmptyState
                title="All caught up"
                body={
                  typeFilter
                    ? `No undecided ${humanise(typeFilter).toLowerCase()} facts.`
                    : 'Nothing is awaiting a decision.'
                }
              />
            ) : (
              <ul className="fact-list">
                {pending.map((fact) => (
                  <FactRow
                    key={fact.id}
                    fact={fact}
                    busy={decide.isPending}
                    onDecide={(status) => decide.mutate({ factId: fact.id, body: { status } })}
                  />
                ))}
              </ul>
            )}
          </Card>

          {decided.length > 0 && (
            <Card
              title="Decided"
              description="Kept with their evidence. A rejected fact is a record of what was proposed and refused."
              actions={
                <Button size="sm" variant="ghost" onClick={() => setShowDecided((v) => !v)}>
                  {showDecided ? 'Hide' : `Show ${decided.length}`}
                </Button>
              }
              flush
            >
              {showDecided ? (
                <ul className="fact-list">
                  {decided.map((fact) => (
                    <FactRow key={fact.id} fact={fact} busy={false} />
                  ))}
                </ul>
              ) : null}
            </Card>
          )}
        </>
      )}

      <p className="ui-muted documents__note">
        Facts Gate 1 found <em>contradicted</em> or <em>unsupported</em> are quarantined by
        the API and cannot be requested, so this is not the complete set of what the model
        proposed &mdash; only what survived the automated checks.
      </p>
    </div>
  )
}

function statusTone(status: FactStatus): BadgeTone {
  if (status === 'accepted') return 'ok'
  if (status === 'rejected') return 'danger'
  if (status === 'superseded') return 'warn'
  return 'neutral'
}

function FactRow({
  fact,
  busy,
  onDecide,
}: {
  fact: FactListItem
  busy: boolean
  onDecide?: (status: 'accepted' | 'rejected') => void
}) {
  const [open, setOpen] = useState(false)
  const verdict = verdictLabel(fact.verdict)
  const promotes = promotesOnAccept(fact.fact_type)
  const evidence = fact.evidence[0]

  return (
    <li className={`fact${fact.status === 'superseded' ? ' is-superseded' : ''}`}>
      <div className="fact__main">
        {/* The claim leads. It used to be the fourth thing on the row. */}
        <p className="fact__claim">{fact.content}</p>

        <div className="fact__tags">
          <Badge tone="neutral">{humanise(fact.fact_type)}</Badge>
          <Badge tone={verdict.tone} title={verdict.help}>
            {verdict.label}
          </Badge>
          {fact.status !== 'pending' && (
            <Badge tone={statusTone(fact.status)}>{humanise(fact.status)}</Badge>
          )}
          {fact.promoted_to_type && (
            <Badge tone="accent" title="Accepting this created a record elsewhere.">
              became a {fact.promoted_to_type}
            </Badge>
          )}
          {fact.extracted_at && (
            <span className="ui-muted fact__when">{formatRelative(fact.extracted_at)}</span>
          )}
        </div>

        {/* The quote stays visible -- it is the evidence, and the whole point
            is that you read it before deciding. */}
        {evidence ? (
          <blockquote className="fact__quote">
            &ldquo;{evidence.snippet}&rdquo;
            {evidence.speaker && (
              <span className="fact__speaker">&mdash; {evidence.speaker}</span>
            )}
          </blockquote>
        ) : (
          <p className="ui-callout ui-callout--danger fact__nowarn">
            No evidence recorded. Gate 0 rejects facts without a span on insert, so this
            row should not exist.
          </p>
        )}

        {open && (
          <div className="fact__detail">
            <p className="facts-legend__body">{verdict.help}</p>
            <dl className="fact__meta">
              <div>
                <dt>Span check</dt>
                <dd>
                  {evidence
                    ? verificationLabel(evidence.verification_status).label
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Self-reported</dt>
                <dd>{fact.confidence === null ? '—' : fact.confidence.toFixed(2)}</dd>
              </div>
              {fact.evidence.length > 1 && (
                <div>
                  <dt>Other quotes</dt>
                  <dd>{fact.evidence.length - 1}</dd>
                </div>
              )}
            </dl>
            {fact.evidence.slice(1).map((e) => (
              <blockquote key={e.evidence_id} className="fact__quote">
                &ldquo;{e.snippet}&rdquo;
              </blockquote>
            ))}
          </div>
        )}
      </div>

      <div className="fact__actions">
        {onDecide && (
          <>
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              // The label says which of the two things it does, because they
              // are not the same act.
              title={
                promotes
                  ? 'Creates a commitment record on this deal.'
                  : 'Marks this true, so the next analysis pass can use it.'
              }
              onClick={() => onDecide('accepted')}
            >
              {promotes ? 'Accept → commitment' : 'Confirm'}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onDecide('rejected')}>
              Reject
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Less' : 'Why'}
        </Button>
      </div>
    </li>
  )
}
