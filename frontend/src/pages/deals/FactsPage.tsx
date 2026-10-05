import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { facts, keys } from '../../lib/queries'
import { FACT_STATUSES, FACT_TYPES } from '../../lib/types'
import type { FactFilters, FactListItem, Verdict } from '../../lib/types'
import { formatRelative, humanise } from '../../lib/format'
import { verificationLabel } from '../../lib/verification'
import type { BadgeTone } from '../../components/ui/Badge'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  SelectField,
} from '../../components/ui'
import { useDeal } from './dealContext'
import './deals.css'

/**
 * Gate 1's verdict -> badge.
 *
 * This is a real verdict and the only one the API exposes anywhere, so it gets
 * the colour. `null` is "not yet validated" and is neutral: the schema is
 * explicit that absent is a distinct state and is **not** defaulted to a pass,
 * so it must not be green.
 */
function verdictLabel(verdict: Verdict | null): { tone: BadgeTone; label: string; help: string } {
  switch (verdict) {
    case 'supported':
      return {
        tone: 'ok',
        label: 'Supported',
        help: 'Gate 1 checked the quoted span and it supports this claim.',
      }
    case 'partial':
      return {
        tone: 'warn',
        label: 'Partly supported',
        help: 'The span backs some of this claim but not all of it.',
      }
    case 'contradicted':
      return {
        tone: 'danger',
        label: 'Contradicted',
        help: 'The source says something incompatible with this claim.',
      }
    case 'unsupported':
      return {
        tone: 'danger',
        label: 'Unsupported',
        help: 'The quoted span does not back this claim.',
      }
    default:
      return {
        tone: 'neutral',
        label: 'Not validated',
        help: 'Gate 1 has not checked this. Absent is not a pass.',
      }
  }
}

function factStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'accepted':
      return 'ok'
    case 'rejected':
      return 'danger'
    case 'superseded':
      return 'warn'
    default:
      return 'neutral'
  }
}

/**
 * Phase 9: facts.
 *
 * **Task 9.1, decided: read-only, labelled as a view.** The schema documents
 * Gate 3 as "a human accepting a fact creates the commitments/tasks row",
 * recorded in `promoted_to_type` / `promoted_to_id` -- but **no endpoint does
 * it.** `GET /deals/{id}/facts` is the only operation. Building the review
 * queue the design intends would mean adding `PATCH .../facts/{id}` plus the
 * promotion service first, which is backend work and not in this plan.
 *
 * So this page displays, filters and explains, and says plainly that it cannot
 * be the review queue. That is the plan's own worked example of shipping the
 * smaller honest version rather than waiting.
 *
 * `?include_quarantined` is also missing, so `contradicted` and `unsupported`
 * facts are filtered out server-side and **cannot be shown at all**. The page
 * says so, because a list that silently omits the facts most worth doubting
 * would be the most misleading version of this screen.
 */
export function FactsPage() {
  const deal = useDeal()
  const [filters, setFilters] = useState<FactFilters>({})

  const list = useQuery({
    queryKey: keys.facts(deal.id, filters),
    queryFn: () => facts.list(deal.id, filters),
  })

  const rows = list.data ?? []
  // Task 9.4: a superseded fact stays visible beside what replaced it.
  // Contradiction must never overwrite -- both rows keep their evidence.
  const superseded = rows.filter((f) => f.status === 'superseded')

  return (
    <div className="ui-stack">
      <div className="ui-callout ui-callout--info">
        <strong>This is a view, not a review queue.</strong> Facts are read-only over
        HTTP: the design has a human accepting a fact to create a commitment or task, but
        no endpoint does that yet, so nothing here can be accepted or rejected.
      </div>

      <Card
        title="Extracted facts"
        description="What extraction found, and the span each claim is grounded in."
        actions={
          <div className="documents__filters">
            <SelectField
              label={<span className="ui-sr-only">Type</span>}
              value={filters.fact_type?.[0] ?? ''}
              onChange={(event) => {
                const v = event.target.value
                setFilters((c) => ({
                  ...c,
                  fact_type: v ? [v as (typeof FACT_TYPES)[number]] : undefined,
                }))
              }}
            >
              <option value="">All types</option>
              {FACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanise(t)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={<span className="ui-sr-only">Status</span>}
              value={filters.status?.[0] ?? ''}
              onChange={(event) => {
                const v = event.target.value
                setFilters((c) => ({
                  ...c,
                  status: v ? [v as (typeof FACT_STATUSES)[number]] : undefined,
                }))
              }}
            >
              <option value="">All statuses</option>
              {FACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanise(s)}
                </option>
              ))}
            </SelectField>
          </div>
        }
        flush
      >
        {list.isPending ? (
          <LoadingBlock label="Loading facts..." />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filters.fact_type || filters.status ? 'No facts match' : 'No facts extracted'}
            body={
              filters.fact_type || filters.status
                ? 'Nothing in this slice. Note that contradicted and unsupported facts are never returned by the API, so they cannot appear here under any filter.'
                : 'Extraction runs over a meeting transcript. Upload one and analyse the meeting, and what it finds lands here.'
            }
            actions={
              filters.fact_type || filters.status ? (
                <Button size="sm" onClick={() => setFilters({})}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="fact-list">
            {rows.map((fact) => (
              <FactRow key={fact.id} fact={fact} superseded={superseded} />
            ))}
          </ul>
        )}
      </Card>

      <p className="ui-muted documents__note">
        Quarantined facts &mdash; those Gate 1 found <em>contradicted</em> or{' '}
        <em>unsupported</em> &mdash; are filtered out by the API and there is no way to
        request them, so this list is not the complete set of what the model proposed.
      </p>
    </div>
  )
}

function FactRow({ fact, superseded }: { fact: FactListItem; superseded: FactListItem[] }) {
  const verdict = verdictLabel(fact.verdict)

  // Task 9.4. There is no `supersedes` pointer on the wire, so the pairing is
  // by fact type: a superseded row is shown beside the live rows of the same
  // type, which is the honest approximation rather than inventing a link.
  const replacements =
    fact.status === 'superseded'
      ? []
      : superseded.filter((s) => s.fact_type === fact.fact_type && s.id !== fact.id)

  return (
    <li className={`fact${fact.status === 'superseded' ? ' is-superseded' : ''}`}>
      <div className="fact__head">
        <Badge tone="neutral">{humanise(fact.fact_type)}</Badge>
        <Badge tone={factStatusTone(fact.status)}>{humanise(fact.status)}</Badge>
        <Badge tone={verdict.tone} title={verdict.help}>
          {verdict.label}
        </Badge>
        {fact.extracted_at && (
          <span className="ui-muted risk-card__seen">
            extracted {formatRelative(fact.extracted_at)}
          </span>
        )}
      </div>

      <p className="fact__content">{fact.content}</p>

      {fact.status === 'superseded' && (
        <p className="ui-muted fact__note">
          Superseded by a later extraction. Kept with its evidence rather than overwritten
          &mdash; a contradiction has to leave both records standing.
        </p>
      )}

      {replacements.length > 0 && (
        <p className="ui-muted fact__note">
          {replacements.length} earlier {humanise(fact.fact_type).toLowerCase()} fact
          {replacements.length === 1 ? '' : 's'} on this deal {replacements.length === 1 ? 'was' : 'were'}{' '}
          superseded; {replacements.length === 1 ? 'it is' : 'they are'} still listed below with{' '}
          {replacements.length === 1 ? 'its' : 'their'} own evidence.
        </p>
      )}

      {/* Task 9.5, and the same rule as 5.6. `confidence` and `verdict` are
          shown side by side and never conflated: one is the generator's
          self-report about its own output, the other is an independent check.
          The schema records that this corpus came back at exactly 1.00 across
          every fact, which is the clearest demonstration that the number
          carries no information -- so it is labelled as self-reported and
          placed after the verdict, never instead of it. */}
      {fact.confidence !== null && (
        <p className="ui-muted fact__confidence">
          Self-reported confidence {fact.confidence.toFixed(2)} &mdash; the generator&rsquo;s
          own guess about its own output, not a validation result. The verdict above is the
          independent check.
        </p>
      )}

      {fact.evidence.length > 0 ? (
        <ul className="fact__evidence">
          {fact.evidence.map((item) => {
            const verification = verificationLabel(item.verification_status)
            return (
              <li key={item.evidence_id}>
                <blockquote className="evidence__snippet">&ldquo;{item.snippet}&rdquo;</blockquote>
                <div className="ui-row fact__evidence-meta">
                  {item.speaker && <span className="evidence__speaker">{item.speaker}</span>}
                  <Badge tone={verification.tone} title={verification.explanation}>
                    {verification.label}
                  </Badge>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        // Gate 0 rejects a fact with no evidence on insert, so this should be
        // unreachable. Said rather than rendered as an empty space.
        <p className="ui-callout ui-callout--danger fact__note">
          No evidence recorded. Gate 0 rejects facts without a span on insert, so this row
          should not exist.
        </p>
      )}
    </li>
  )
}
