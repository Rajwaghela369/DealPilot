import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../../lib/api'
import { deals, keys } from '../../lib/queries'
import type { DealCreate, DealFilters, DealListItem } from '../../lib/types'
import { useDebounced } from '../../lib/useDebounced'
import { EMPTY, formatDate, formatMoney, formatRelative, humanise, riskTone, stageTone } from '../../lib/format'
import type { Column } from '../../components/ui'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Pager,
  Table,
  useToast,
} from '../../components/ui'
import { PageHeader } from '../../components/PageHeader'
import { DealFilterBar } from './DealFilterBar'
import { DealCreateForm } from './DealCreateForm'
import './deals.css'

const LIMIT = 25

/**
 * Phase 2: the pipeline table.
 *
 * The first screen that proves the transport, the cache and pagination
 * against a real table -- which is why it comes before the workspace it
 * navigates into, and after the accounts that make a deal creatable.
 */
export function PipelinePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [filters, setFilters] = useState<DealFilters>({ sort: '-last_activity_at' })
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [creating, setCreating] = useState(false)

  const q = useDebounced(search.trim()) || undefined
  const query: DealFilters = { ...filters, q, limit: LIMIT, offset }

  const list = useQuery({
    queryKey: keys.deals(query),
    queryFn: () => deals.list(query),
  })

  const create = useMutation({
    mutationFn: (body: DealCreate) => deals.create(body),
    onSuccess: async (deal) => {
      await queryClient.invalidateQueries({ queryKey: keys.deals() })
      setCreating(false)
      toast.success(`Created ${deal.name}.`)
      navigate(`/deals/${deal.id}`)
    },
  })

  /**
   * Task 2.2, the part that matters.
   *
   * A 422 here is the backend naming a parameter it does not accept, and it
   * is deliberate (`extra="forbid"`) -- the alternative design returns the
   * whole unfiltered pipeline with a 200, which looks exactly like a working
   * filter. So it is surfaced as its own message rather than folded into
   * "that did not work": the list on screen is not a filtered list, and the
   * user needs to know which control lied.
   */
  const filterRejected = list.error instanceof ApiError && list.error.status === 422

  const columns: Column<DealListItem>[] = [
    {
      key: 'name',
      header: 'Deal',
      render: (row) => (
        <div>
          <div className="deal-cell__name">{row.name}</div>
          <div className="deal-cell__sub">{row.account_name}</div>
        </div>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (row) => (
        <div className="ui-stack" style={{ gap: 'var(--space-1)' }}>
          <Badge tone={stageTone(row.stage)}>{humanise(row.stage)}</Badge>
          <span className="deal-cell__sub">{row.days_in_stage}d in stage</span>
        </div>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      numeric: true,
      render: (row) => formatMoney(row.value, row.currency),
    },
    {
      key: 'risk',
      header: 'Risk',
      render: (row) =>
        // Null is not "low": the rollup is null until the analyzer has run,
        // and showing "low" would assert a verdict nothing has reached.
        row.risk_level ? (
          <Badge tone={riskTone(row.risk_level)}>{humanise(row.risk_level)}</Badge>
        ) : (
          <span className="ui-muted" title="No analysis has set a risk level for this deal yet.">
            not assessed
          </span>
        ),
    },
    {
      key: 'close',
      header: 'Expected close',
      render: (row) => formatDate(row.expected_close_date),
    },
    {
      key: 'activity',
      header: 'Last activity',
      render: (row) => (
        <span title={row.last_activity_at ?? 'No recorded activity'}>
          {formatRelative(row.last_activity_at)}
        </span>
      ),
    },
    {
      key: 'next',
      header: 'Next action',
      render: (row) =>
        row.next_action ? (
          <div>
            <div>{row.next_action}</div>
            {row.next_action_due_date && (
              <div className="deal-cell__sub">due {formatDate(row.next_action_due_date)}</div>
            )}
          </div>
        ) : (
          // Derived from the oldest open task, so "nothing" means no open
          // task rather than an empty column on the deal.
          <span className="ui-muted">{EMPTY}</span>
        ),
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Pipeline"
        subtitle="Every deal, filtered and paged."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New deal
          </Button>
        }
      />

      <Card flush>
        <DealFilterBar
          value={filters}
          search={search}
          onSearchChange={(next) => {
            setSearch(next)
            setOffset(0)
          }}
          onChange={(next) => {
            setFilters(next)
            setOffset(0)
          }}
        />

        {list.isPending ? (
          <LoadingBlock label="Loading deals..." />
        ) : filterRejected ? (
          <EmptyState
            tone="error"
            title="The server rejected one of these filters"
            body={
              <>
                {(list.error as ApiError).message}
                <br />
                Nothing below is filtered, so clear the filters rather than reading this as
                an empty pipeline.
              </>
            }
            actions={
              <Button
                size="sm"
                onClick={() => {
                  setSearch('')
                  setFilters({ sort: '-last_activity_at' })
                  setOffset(0)
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <>
            <Table
              columns={columns}
              rows={list.data.items}
              rowKey={(row) => row.id}
              onRowClick={(row) => navigate(`/deals/${row.id}`)}
              empty={
                // Task 2.4: a fresh install has no deals *and* no accounts,
                // and the second is the actual blocker -- `POST /deals`
                // requires an `account_id`. Pointing at "New deal" here would
                // open a form whose only required field cannot be filled.
                q || Object.keys(filters).length > 1 ? (
                  <EmptyState
                    title="No deals match"
                    body="Nothing in the pipeline matches these filters."
                    actions={
                      <Button
                        size="sm"
                        onClick={() => {
                          setSearch('')
                          setFilters({ sort: '-last_activity_at' })
                          setOffset(0)
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    title="No deals yet"
                    body={
                      <>
                        A deal belongs to an account, so start there --{' '}
                        <Link to="/accounts">Accounts</Link> is where the first one gets
                        created.
                      </>
                    }
                    actions={
                      <>
                        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                          New deal
                        </Button>
                        <Button size="sm" onClick={() => navigate('/accounts')}>
                          Go to accounts
                        </Button>
                      </>
                    }
                  />
                )
              }
            />
            <Pager
              total={list.data.total}
              limit={list.data.limit}
              offset={list.data.offset}
              onOffsetChange={setOffset}
              busy={list.isFetching}
            />
          </>
        )}
      </Card>

      {creating && (
        <DealCreateForm
          busy={create.isPending}
          error={create.error}
          onSubmit={(body) => create.mutate(body)}
          onClose={() => {
            setCreating(false)
            create.reset()
          }}
        />
      )}
    </div>
  )
}
