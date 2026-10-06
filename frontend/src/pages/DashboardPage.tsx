import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { ReactNode } from 'react'
import { deals, keys, meetings, system, tasks } from '../lib/queries'
import { DEAL_STAGES } from '../lib/types'
import type { DealListItem, MeetingListItem, TaskFilters, TaskListItem } from '../lib/types'
import { formatDate, formatMoney, formatRelative, humanise } from '../lib/format'
import { Badge, Card, EmptyState, ErrorState, LoadingBlock } from '../components/ui'
import { PageHeader } from '../components/PageHeader'
import './dashboard.css'

/** Everything open, in one page. See the note on the pipeline card's help. */
const PIPELINE_LIMIT = 200

/**
 * How many deals the meetings panel will fan out over.
 *
 * There is no cross-deal meetings endpoint -- `meetings` is only reachable as
 * `/deals/{id}/meetings` -- so a dashboard view of them costs one request per
 * deal. At sixteen open deals that is fine; at two hundred it is not, which is
 * why the cap is explicit and the panel says when it has been hit rather than
 * quietly showing a subset.
 */
const MEETING_FANOUT = 20

function dayOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Phase 12, with the panels rebuilt as navigation.
 *
 * Every figure here is client-side arithmetic over list responses -- there is no
 * aggregate endpoint -- which is fine at this volume and stated in the help
 * rather than hidden.
 *
 * The rows are the change worth noting. They used to be text with a link
 * somewhere inside, so the obvious gesture (click the row) did nothing. Each is
 * now a real `<Link>` covering the whole row, which also makes them
 * keyboard-reachable and middle-clickable without any extra handling.
 */
export function DashboardPage() {
  const pipelineFilters = { open: true, limit: PIPELINE_LIMIT, offset: 0 }
  const pipeline = useQuery({
    queryKey: keys.deals(pipelineFilters),
    queryFn: () => deals.list(pipelineFilters),
  })

  const stalledFilters = { open: true, stalled: true, limit: 6, offset: 0 }
  const stalled = useQuery({
    queryKey: keys.deals(stalledFilters),
    queryFn: () => deals.list(stalledFilters),
  })

  const closingFilters = {
    open: true,
    close_before: dayOffset(7),
    limit: 6,
    offset: 0,
    sort: 'expected_close_date' as const,
  }
  const closing = useQuery({
    queryKey: keys.deals(closingFilters),
    queryFn: () => deals.list(closingFilters),
  })

  const taskFilters: TaskFilters = { open: true, sort: 'due_date', limit: 7, offset: 0 }
  const dueSoon = useQuery({
    queryKey: keys.taskList(taskFilters),
    queryFn: () => tasks.list(taskFilters),
  })

  const ai = useQuery({
    queryKey: keys.aiStatus(),
    queryFn: system.aiStatus,
    refetchInterval: 60_000,
  })

  const openDeals = pipeline.data?.items ?? []
  const fanOut = openDeals.slice(0, MEETING_FANOUT)

  // One query per deal, because there is no endpoint that spans them.
  const meetingQueries = useQueries({
    queries: fanOut.map((d) => ({
      queryKey: keys.meetings(d.id),
      queryFn: () => meetings.list(d.id),
      staleTime: 60_000,
    })),
  })

  const meetingsLoading = meetingQueries.some((q) => q.isPending)
  const dealNameById = new Map(fanOut.map((d) => [d.id, d.name]))
  const allMeetings: (MeetingListItem & { deal_id: string })[] = meetingQueries.flatMap(
    (q, i) => (q.data ?? []).map((m) => ({ ...m, deal_id: fanOut[i].id })),
  )

  // Lazy initial state rather than a bare `Date.now()`: reading the clock
  // during render is impure, and pinning it to mount is also the behaviour you
  // want -- "upcoming" should not reclassify a meeting mid-render because a
  // second elapsed.
  const [now] = useState(() => Date.now())
  const upcoming = allMeetings
    .filter(
      (m) =>
        m.status === 'scheduled' && m.scheduled_at && new Date(m.scheduled_at).getTime() >= now,
    )
    .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : 1))
    .slice(0, 6)

  // Held, has a transcript, and nothing has read it. The actionable backlog.
  const unanalysed = allMeetings.filter(
    (m) =>
      m.has_transcript &&
      (m.analysis_status === 'not_started' || m.analysis_status === 'failed'),
  )

  const total = pipeline.data?.total ?? 0
  const complete = total <= PIPELINE_LIMIT
  const inFlight = DEAL_STAGES.filter((s) => s !== 'closed_won' && s !== 'closed_lost')
  const byStage = inFlight.map((stage) => ({
    stage,
    deals: openDeals.filter((d) => d.stage === stage),
  }))
  const openValue = openDeals.reduce((sum, d) => sum + (d.value ? Number(d.value) : 0), 0)

  return (
    <div className="page">
      <PageHeader title="Dashboard" subtitle="Where attention is needed, across every open deal." />

      <Card
        title="Pipeline"
        description={
          pipeline.data
            ? `${total} open ${total === 1 ? 'deal' : 'deals'} · ${formatMoney(String(openValue))}`
            : undefined
        }
        info={
          <>
            <p>
              Figures are calculated from the open pipeline each time this page loads. There
              is no stored summary, so they are always current.
            </p>
            <p>
              This view reads up to {PIPELINE_LIMIT} deals in one request. Beyond that the
              totals would cover only part of the pipeline, and the page says so rather than
              showing a partial figure as if it were complete.
            </p>
          </>
        }
      >
        {pipeline.isPending ? (
          <LoadingBlock label="Loading pipeline..." />
        ) : pipeline.isError ? (
          <ErrorState error={pipeline.error} onRetry={pipeline.refetch} />
        ) : openDeals.length === 0 ? (
          <EmptyState
            title="No open deals"
            body="Every figure here comes from the open pipeline, so there is nothing to summarise yet."
            actions={<Link to="/deals">Go to the pipeline</Link>}
          />
        ) : (
          <>
            {!complete && (
              <div className="ui-callout ui-callout--warn">
                {total} open deals, of which this page reads {PIPELINE_LIMIT}. The figures
                below cover that window only.
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
                  <Link to={`/deals?stage=${row.stage}`} className="stage-legend__label">
                    {humanise(row.stage)}
                  </Link>
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
        {/* ---------------------------------------------- Needs attention */}
        <Card
          title="Needs attention"
          description="Deals that are stuck or running out of time."
          info={
            <>
              <p>
                <strong>Stalled</strong> means a deal has not changed stage within the normal
                window for the stage it is in. The thresholds differ by stage, so forty days
                in a security review is not treated the same as forty days in discovery.
              </p>
              <p>
                <strong>Closing soon</strong> lists deals with an expected close date inside
                the next seven days that are still open.
              </p>
            </>
          }
        >
          {stalled.isPending || closing.isPending ? (
            <LoadingBlock label="Loading..." />
          ) : stalled.isError ? (
            <ErrorState error={stalled.error} onRetry={stalled.refetch} />
          ) : (
            <div className="dash-groups">
              <DashGroup
                label="Stalled"
                count={stalled.data?.total ?? 0}
                tone="warn"
                empty="No deals are stalled."
              >
                {(stalled.data?.items ?? []).map((d) => (
                  <DealRow
                    key={d.id}
                    deal={d}
                    meta={`${d.days_in_stage}d in ${humanise(d.stage).toLowerCase()}`}
                  />
                ))}
              </DashGroup>
              <DashGroup
                label="Closing within 7 days"
                count={closing.data?.total ?? 0}
                tone="danger"
                empty="Nothing closes this week."
              >
                {(closing.data?.items ?? []).map((d) => (
                  <DealRow key={d.id} deal={d} meta={formatDate(d.expected_close_date)} />
                ))}
              </DashGroup>
            </div>
          )}
        </Card>

        {/* ------------------------------------------------------ Meetings */}
        <Card
          title="Meetings"
          description="What is scheduled, and what is waiting to be analysed."
          info={
            <>
              <p>
                <strong>Upcoming</strong> lists scheduled meetings still in the future, so
                they can be prepared for. <strong>Awaiting analysis</strong> lists meetings
                that have a transcript attached which has not yet been processed, or whose
                last attempt failed.
              </p>
              <p>
                Meetings belong to a deal and are read one deal at a time, so this panel
                covers the {MEETING_FANOUT} most recently active open deals rather than all
                of them.
              </p>
            </>
          }
        >
          {pipeline.isPending || meetingsLoading ? (
            <LoadingBlock label="Loading meetings..." />
          ) : (
            <div className="dash-groups">
              <DashGroup
                label="Upcoming"
                count={upcoming.length}
                tone="info"
                empty="Nothing scheduled."
              >
                {upcoming.map((m) => (
                  <DashRow
                    key={m.id}
                    to={`/deals/${m.deal_id}/meetings/${m.id}`}
                    title={m.title}
                    sub={dealNameById.get(m.deal_id) ?? ''}
                    meta={formatRelative(m.scheduled_at)}
                    marker="info"
                  />
                ))}
              </DashGroup>
              <DashGroup
                label="Awaiting analysis"
                count={unanalysed.length}
                tone="warn"
                empty="Every transcript has been analysed."
              >
                {unanalysed.slice(0, 6).map((m) => (
                  <DashRow
                    key={m.id}
                    to={`/deals/${m.deal_id}/meetings/${m.id}`}
                    title={m.title}
                    sub={dealNameById.get(m.deal_id) ?? ''}
                    meta={m.analysis_status === 'failed' ? 'failed' : 'not started'}
                    marker={m.analysis_status === 'failed' ? 'danger' : 'warn'}
                  />
                ))}
              </DashGroup>
            </div>
          )}
        </Card>

        {/* --------------------------------------------------------- Tasks */}
        <Card
          title="Tasks due"
          description="Open work across the pipeline, soonest first."
          info={
            <p>
              Ordered by due date, with undated work last. A task without a due date is
              unscheduled rather than late, so it is never counted as overdue.
            </p>
          }
        >
          {dueSoon.isPending ? (
            <LoadingBlock label="Loading tasks..." />
          ) : dueSoon.isError ? (
            <ErrorState error={dueSoon.error} onRetry={dueSoon.refetch} />
          ) : dueSoon.data.items.length === 0 ? (
            <EmptyState title="Nothing open" body="No open tasks across the pipeline." />
          ) : (
            <>
              <ul className="dash-list">
                {dueSoon.data.items.map((t: TaskListItem) => (
                  <DashRow
                    key={t.id}
                    to="/tasks"
                    title={t.title}
                    sub={t.deal_name}
                    meta={t.due_date ? formatDate(t.due_date) : 'unscheduled'}
                    metaTone={t.is_overdue ? 'danger' : undefined}
                    marker={t.is_overdue ? 'danger' : t.priority === 'urgent' ? 'warn' : 'neutral'}
                  />
                ))}
              </ul>
              {dueSoon.data.total > dueSoon.data.items.length && (
                <Link to="/tasks" className="dash-more">
                  {dueSoon.data.total - dueSoon.data.items.length} more in Tasks &rarr;
                </Link>
              )}
            </>
          )}
        </Card>

        {/* ----------------------------------------------------- AI status */}
        <Card
          title="Automation"
          description="Whether the analysis layer is running, and how much is waiting."
          info={
            <p>
              Risk detection runs on database queries and works whether or not the model
              layer is enabled. Transcript extraction, meeting briefs and the assistant all
              require it.
            </p>
          }
        >
          {ai.isPending ? (
            <LoadingBlock label="Loading..." />
          ) : ai.isError ? (
            <ErrorState error={ai.error} onRetry={ai.refetch} />
          ) : (
            <div className="ui-stack">
              <div className="ui-row">
                <Badge tone={ai.data.config.enabled ? 'ok' : 'danger'}>
                  {ai.data.config.enabled ? 'Running' : 'Disabled'}
                </Badge>
                {!ai.data.config.enabled && (
                  <span className="ui-muted dash-row__sub">
                    Risk detection continues; extraction and chat do not.
                  </span>
                )}
              </div>

              <dl className="dash-stats">
                <DashStat label="Deals awaiting a pass" value={ai.data.queues.sweep_backlog} />
                <DashStat label="Pending changes" value={ai.data.queues.dirty_deals} />
                <DashStat label="Meetings queued" value={ai.data.queues.queued_meetings} />
              </dl>

              {ai.data.queues.oldest_dirty_at && (
                <p className="ui-muted brief__meta">
                  Oldest pending change {formatRelative(ai.data.queues.oldest_dirty_at)}.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function DashStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="dash-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function DashGroup({
  label,
  count,
  tone,
  empty,
  children,
}: {
  label: string
  count: number
  tone: 'info' | 'warn' | 'danger'
  empty: string
  children: ReactNode
}) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children
  const isEmpty = Array.isArray(rows) ? rows.length === 0 : !rows
  return (
    <div className="dash-group">
      <h4 className="dash-group__head">
        <span>{label}</span>
        {count > 0 ? (
          <Badge tone={tone}>{count}</Badge>
        ) : (
          <Badge tone="ok">0</Badge>
        )}
      </h4>
      {isEmpty ? (
        <p className="ui-muted dash-group__empty">{empty}</p>
      ) : (
        <ul className="dash-list">{rows}</ul>
      )}
    </div>
  )
}

function DealRow({ deal, meta }: { deal: DealListItem; meta: string }) {
  return (
    <DashRow
      to={`/deals/${deal.id}`}
      title={deal.name}
      sub={deal.account_name}
      meta={meta}
      marker={deal.risk_level === 'high' ? 'danger' : 'warn'}
      aside={formatMoney(deal.value, deal.currency)}
    />
  )
}

/**
 * One navigable row.
 *
 * A real `<Link>` wrapping the whole row rather than a `<div onClick>` with a
 * link inside it. That was the actual defect in the previous version: the row
 * looked clickable, the gesture people use is clicking it, and only the small
 * text target did anything. An anchor also gets keyboard focus, middle-click and
 * open-in-new-tab for free, none of which a click handler provides.
 */
function DashRow({
  to,
  title,
  sub,
  meta,
  metaTone,
  marker = 'neutral',
  aside,
}: {
  to: string
  title: string
  sub: string
  meta: string
  metaTone?: 'danger'
  marker?: 'neutral' | 'info' | 'warn' | 'danger'
  aside?: string
}) {
  return (
    <li>
      <Link to={to} className="dash-row">
        <span className={`dash-row__marker dash-row__marker--${marker}`} aria-hidden="true" />
        <span className="dash-row__main">
          <span className="dash-row__title">{title}</span>
          <span className="dash-row__sub">{sub}</span>
        </span>
        {aside && <span className="dash-row__aside">{aside}</span>}
        <span className={`dash-row__meta${metaTone ? ` is-${metaTone}` : ''}`}>{meta}</span>
      </Link>
    </li>
  )
}
