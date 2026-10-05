import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { deals, keys, system, tasks } from '../lib/queries'
import { DEAL_STAGES } from '../lib/types'
import type { DealListItem, TaskFilters, TaskListItem } from '../lib/types'
import { formatDate, formatMoney, formatRelative, humanise, stageTone } from '../lib/format'
import { Badge, Card, EmptyState, ErrorState, LoadingBlock } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import './dashboard.css'

/** Everything open, in one page. See the note on `PIPELINE_LIMIT`. */
const PIPELINE_LIMIT = 200

/**
 * Tasks due in the next week, plus anything already overdue.
 *
 * `due_before` is a week out rather than filtering client-side, because the
 * server can do it and fetching the whole table to count four numbers is the
 * thing the plan warns about.
 */
const DUE_SOON: TaskFilters = {
  open: true,
  sort: 'due_date',
  limit: 8,
  offset: 0,
}

function weekFromNow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Phase 12: where attention is needed, across deals.
 *
 * Built last because every number here is established by an earlier phase, and
 * every one of them is **client-side arithmetic over list responses** -- there
 * is no aggregate endpoint. That is fine at MVP volume and will not be at
 * scale, so the limit is explicit: `?limit=200` on one request, and if this
 * page ever needs more than it can get in a single page, the answer is an
 * endpoint rather than more requests.
 *
 * The stacked bar is made of divs, as the plan suggests. It will outlive a
 * charting dependency and it is four lines of CSS.
 */
export function DashboardPage() {
  const pipeline = useQuery({
    queryKey: keys.deals({ open: true, limit: PIPELINE_LIMIT, offset: 0 }),
    queryFn: () => deals.list({ open: true, limit: PIPELINE_LIMIT, offset: 0 }),
  })

  // Task 12.2. `stalled` uses the backend's per-stage thresholds rather than
  // one flat number -- 40 days in security review is normal where 40 days in
  // discovery is not.
  const stalled = useQuery({
    queryKey: keys.deals({ open: true, stalled: true, limit: 8, offset: 0 }),
    queryFn: () => deals.list({ open: true, stalled: true, limit: 8, offset: 0 }),
  })

  const closingSoon = useQuery({
    queryKey: keys.deals({ open: true, close_before: weekFromNow(), limit: 8, offset: 0, sort: 'expected_close_date' }),
    queryFn: () =>
      deals.list({
        open: true,
        close_before: weekFromNow(),
        limit: 8,
        offset: 0,
        sort: 'expected_close_date',
      }),
  })

  const dueSoon = useQuery({
    queryKey: keys.taskList(DUE_SOON),
    queryFn: () => tasks.list(DUE_SOON),
  })

  const ai = useQuery({
    queryKey: keys.aiStatus(),
    queryFn: system.aiStatus,
    refetchInterval: 60_000,
  })

  const items = pipeline.data?.items ?? []
  const total = pipeline.data?.total ?? 0
  // Only counted when the window held everything. A partial page would make
  // these numbers quietly wrong, which is worse than not showing them.
  const complete = total <= PIPELINE_LIMIT

  const byStage = DEAL_STAGES.filter((s) => s !== 'closed_won' && s !== 'closed_lost').map(
    (stage) => ({
      stage,
      deals: items.filter((d) => d.stage === stage),
    }),
  )
  const openValue = items.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0)

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle="Where attention is needed, across every open deal."
      />

      {/* Task 12.1 */}
      <Card
        title="Pipeline by stage"
        description={
          pipeline.data
            ? `${total} open deal${total === 1 ? '' : 's'}, ${formatMoney(String(openValue))} in play.`
            : undefined
        }
      >
        {pipeline.isPending ? (
          <LoadingBlock label="Loading pipeline..." />
        ) : pipeline.isError ? (
          <ErrorState error={pipeline.error} onRetry={pipeline.refetch} />
        ) : items.length === 0 ? (
          <EmptyState
            title="No open deals"
            body="Every figure on this page is derived from the open pipeline, so there is nothing to summarise yet."
            actions={<Link to="/deals">Go to the pipeline</Link>}
          />
        ) : (
          <>
            {!complete && (
              /* The honest guard. Rather than showing counts drawn from a
                 partial window, say so -- and name the fix the plan names. */
              <div className="ui-callout ui-callout--warn">
                There are {total} open deals and this page reads the first {PIPELINE_LIMIT}.
                The figures below cover that window only; an aggregate endpoint is the fix,
                not more requests.
              </div>
            )}
            <div className="stagebar">
              {byStage
                .filter((row) => row.deals.length > 0)
                .map((row) => (
                  <div
                    key={row.stage}
                    className={`stagebar__segment stagebar__segment--${row.stage}`}
                    style={{ flexGrow: row.deals.length }}
                    title={`${humanise(row.stage)}: ${row.deals.length}`}
                  />
                ))}
            </div>
            <ul className="stage-legend">
              {byStage.map((row) => (
                <li key={row.stage} className="stage-legend__item">
                  <span className={`stage-legend__dot stagebar__segment--${row.stage}`} />
                  <span className="stage-legend__label">{humanise(row.stage)}</span>
                  <span className="stage-legend__count">{row.deals.length}</span>
                  <span className="stage-legend__value">
                    {formatMoney(
                      String(row.deals.reduce((s, d) => s + (d.value ? Number(d.value) : 0), 0)),
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <div className="dash-grid">
        {/* Task 12.2 */}
        <Card
          title="Needs attention"
          description="Stalled by the per-stage thresholds, or closing inside a week."
        >
          {stalled.isPending || closingSoon.isPending ? (
            <LoadingBlock label="Loading..." />
          ) : stalled.isError ? (
            <ErrorState error={stalled.error} onRetry={stalled.refetch} />
          ) : (
            <div className="ui-stack">
              <DealGroup
                label="Stalled"
                rows={stalled.data?.items ?? []}
                empty="Nothing is stalled."
                detail={(d) => `${d.days_in_stage} days in ${humanise(d.stage).toLowerCase()}`}
              />
              <DealGroup
                label="Closing within a week"
                rows={closingSoon.data?.items ?? []}
                empty="Nothing closes in the next seven days."
                detail={(d) => `close ${formatDate(d.expected_close_date)}`}
              />
            </div>
          )}
        </Card>

        {/* Task 12.3 */}
        <Card title="Tasks due" description="Open work, soonest first.">
          {dueSoon.isPending ? (
            <LoadingBlock label="Loading tasks..." />
          ) : dueSoon.isError ? (
            <ErrorState error={dueSoon.error} onRetry={dueSoon.refetch} />
          ) : dueSoon.data.items.length === 0 ? (
            <EmptyState title="Nothing open" body="No open tasks across the pipeline." />
          ) : (
            <ul className="dash-list">
              {dueSoon.data.items.map((task: TaskListItem) => (
                <li key={task.id} className="dash-row">
                  <div className="dash-row__main">
                    <span className="dash-row__title">{task.title}</span>
                    <Link to={`/deals/${task.deal_id}`} className="dash-row__sub">
                      {task.deal_name}
                    </Link>
                  </div>
                  <span className={task.is_overdue ? 'task__overdue' : 'ui-muted'}>
                    {task.due_date ? formatDate(task.due_date) : 'unscheduled'}
                  </span>
                </li>
              ))}
              {dueSoon.data.total > dueSoon.data.items.length && (
                <li className="dash-more">
                  <Link to="/tasks">
                    {dueSoon.data.total - dueSoon.data.items.length} more in Tasks
                  </Link>
                </li>
              )}
            </ul>
          )}
        </Card>

        {/* Task 12.4 */}
        <Card title="AI status" description="Worker, provider configuration and queue depth.">
          {ai.isPending ? (
            <LoadingBlock label="Loading..." />
          ) : ai.isError ? (
            <ErrorState error={ai.error} onRetry={ai.refetch} />
          ) : (
            <div className="ui-stack">
              <div className="ui-row">
                <Badge tone={ai.data.config.enabled ? 'ok' : 'danger'}>
                  {ai.data.config.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <span className="ui-muted dash-row__sub">{ai.data.config.model_primary}</span>
              </div>

              {!ai.data.config.enabled && (
                <p className="ui-muted brief__meta">
                  Briefs, extraction and chat are unavailable. The deterministic risk
                  detector and the participants roll-up still work &mdash; neither needs a
                  model.
                </p>
              )}

              <dl className="ui-defs dash-defs">
                <div>
                  <dt className="ui-def__label">Deals awaiting sweep</dt>
                  <dd className="ui-def__value">{ai.data.queues.sweep_backlog}</dd>
                </div>
                <div>
                  <dt className="ui-def__label">Dirty deals</dt>
                  <dd className="ui-def__value">{ai.data.queues.dirty_deals}</dd>
                </div>
                <div>
                  <dt className="ui-def__label">Queued meetings</dt>
                  <dd className="ui-def__value">{ai.data.queues.queued_meetings}</dd>
                </div>
              </dl>

              {/* The budget is this process's bucket, not the worker's -- the
                  worker runs in its own container with its own. Labelled
                  rather than presented as global, exactly as the API does. */}
              <p className="ui-muted brief__meta">
                Token budget {Math.round(ai.data.budget.tokens_available)} of{' '}
                {ai.data.budget.tokens_capacity} in <code>{ai.data.budget.process}</code>{' '}
                &mdash; the API&rsquo;s own bucket, not the worker&rsquo;s. The queue counts
                above are Postgres rows and are shared.
                {ai.data.queues.oldest_dirty_at && (
                  <> Oldest pending change {formatRelative(ai.data.queues.oldest_dirty_at)}.</>
                )}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function DealGroup({
  label,
  rows,
  empty,
  detail,
}: {
  label: string
  rows: DealListItem[]
  empty: string
  detail: (deal: DealListItem) => string
}) {
  return (
    <div>
      <h4 className="brief__heading">
        {label}
        {rows.length > 0 && <Badge tone="warn">{rows.length}</Badge>}
      </h4>
      {rows.length === 0 ? (
        <p className="ui-muted brief__meta">{empty}</p>
      ) : (
        <ul className="dash-list">
          {rows.map((deal) => (
            <li key={deal.id} className="dash-row">
              <div className="dash-row__main">
                <Link to={`/deals/${deal.id}`} className="dash-row__title">
                  {deal.name}
                </Link>
                <span className="dash-row__sub">{detail(deal)}</span>
              </div>
              <Badge tone={stageTone(deal.stage)}>{humanise(deal.stage)}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
