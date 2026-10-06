import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { keys, tasks } from '../../lib/queries'
import { PRIORITIES } from '../../lib/types'
import type { Priority, TaskFilters, TaskListItem, TaskSort, TaskUpdate } from '../../lib/types'
import { formatDate, humanise } from '../../lib/format'
import { errorMessage } from '../../lib/errorMessage'
import { useDebounced } from '../../lib/useDebounced'
import type { BadgeTone, Column } from '../../components/ui'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Pager,
  RowActions,
  SelectField,
  Table,
  TextField,
  useToast,
} from '../../components/ui'
import { PageHeader } from '../../components/PageHeader'
import { TaskForm } from './TaskForm'
import './tasks.css'

const LIMIT = 25

function priorityTone(priority: Priority): BadgeTone {
  if (priority === 'urgent') return 'danger'
  if (priority === 'high') return 'warn'
  return 'neutral'
}

/**
 * Phase 11: one table of work across the whole pipeline.
 *
 * Paginated, unlike every deal sub-resource -- `/tasks` is one of the three
 * endpoints with a `Page` envelope, because this list is cross-deal and
 * genuinely unbounded.
 *
 * The default sort is `due_date` ascending with nulls last, which is
 * deliberately the same ordering the backend uses for a deal's `next_action`.
 * If the two diverged, the deal page and this table would disagree about what
 * is next.
 */
export function TasksPage() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState<TaskFilters>({ open: true, sort: 'due_date' })
  const [editing, setEditing] = useState<TaskListItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<TaskListItem | null>(null)

  const q = useDebounced(search.trim()) || undefined
  const query: TaskFilters = { ...filters, q, limit: LIMIT, offset }

  const list = useQuery({
    queryKey: keys.taskList(query),
    queryFn: () => tasks.list(query),
  })

  /**
   * A task change moves the deal that owns it.
   *
   * `next_action` on the pipeline row is derived from the oldest open task, and
   * the deal header carries an `open_tasks` count -- so completing a task
   * changes two screens that are not this one.
   */
  const invalidate = (dealId?: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.tasks() }),
      queryClient.invalidateQueries({ queryKey: keys.deals() }),
      ...(dealId ? [queryClient.invalidateQueries({ queryKey: keys.deal(dealId) })] : []),
    ])

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TaskUpdate; dealId: string }) =>
      tasks.update(id, body),
    onSuccess: async (_result, variables) => {
      await invalidate(variables.dealId)
      setEditing(null)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: ({ id }: { id: string; dealId: string }) => tasks.remove(id),
    onSuccess: async (_result, variables) => {
      await invalidate(variables.dealId)
      setRemoving(null)
      toast.success('Task deleted.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const columns: Column<TaskListItem>[] = [
    {
      key: 'done',
      header: <span className="ui-sr-only">Done</span>,
      render: (row) => (
        // Task 11.3: complete inline. A checkbox rather than a menu, because
        // ticking things off is the most common thing done on this page.
        <input
          type="checkbox"
          className="task__check"
          checked={row.status === 'done'}
          disabled={row.status === 'cancelled' || update.isPending}
          aria-label={`Mark "${row.title}" ${row.status === 'done' ? 'open' : 'done'}`}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) =>
            update.mutate({
              id: row.id,
              dealId: row.deal_id,
              body: { status: event.target.checked ? 'done' : 'open' },
            })
          }
        />
      ),
    },
    {
      key: 'title',
      header: 'Task',
      render: (row) => (
        <div>
          <div className={`deal-cell__name${row.status === 'done' ? ' is-done' : ''}`}>
            {row.title}
          </div>
          <div className="deal-cell__sub">
            {/* Task 11.5: provenance, and the payoff of phase 6 -- this is the
                last link in `risk -> recommendation -> [human accepts] ->
                task`, read back.

                Three distinct states, not two. A task with a recommendation
                links to it. A task that is `ai` *without* one came from an
                accepted fact instead, and saying "from a suggestion" there
                would name the wrong parent. Anything else was typed by hand. */}
            {row.source_recommendation_id ? (
              <Link
                to={`/deals/${row.deal_id}/risks#rec-${row.source_recommendation_id}`}
                onClick={(event) => event.stopPropagation()}
              >
                from a suggestion
              </Link>
            ) : row.origin === 'ai' ? (
              <span title="Promoted from an extracted fact rather than an accepted recommendation.">
                from an extracted fact
              </span>
            ) : (
              'added by hand'
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'deal',
      header: 'Deal',
      // Task 11.4.
      render: (row) => (
        <div onClick={(event) => event.stopPropagation()}>
          <Link to={`/deals/${row.deal_id}`} className="deal-cell__name">
            {row.deal_name}
          </Link>
          <div className="deal-cell__sub">{row.account_name}</div>
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      render: (row) =>
        row.due_date ? (
          <span className={row.is_overdue ? 'task__overdue' : undefined}>
            {formatDate(row.due_date)}
            {row.is_overdue && <Badge tone="danger">overdue</Badge>}
          </span>
        ) : (
          // Undated is unscheduled, not late -- the backend is explicit that a
          // task with no due date is never overdue.
          <span className="ui-muted" title="Unscheduled, which is not the same as late.">
            unscheduled
          </span>
        ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => <Badge tone={priorityTone(row.priority)}>{humanise(row.priority)}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.status === 'done' ? 'ok' : row.status === 'cancelled' ? 'neutral' : 'accent'}>
          {humanise(row.status)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: <span className="ui-sr-only">Actions</span>,
      numeric: true,
      render: (row) => (
        <RowActions>
          <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRemoving(row)}>
            Delete
          </Button>
        </RowActions>
      ),
    },
  ]

  const anyFilter = Boolean(q) || filters.open !== true || Boolean(filters.priority?.length) || filters.overdue

  return (
    <div className="page">
      <PageHeader
        title="Tasks"
        subtitle="Every piece of committed work, across the pipeline."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            New task
          </Button>
        }
      />

      <Card flush>
        <div className="filter-bar">
          <div className="ui-form-grid filter-bar__grid">
            <TextField
              label="Search"
              type="search"
              value={search}
              placeholder="Title or description"
              onChange={(event) => {
                setSearch(event.target.value)
                setOffset(0)
              }}
            />
            <SelectField
              label="Status"
              value={filters.open === true ? 'open' : filters.open === false ? 'closed' : 'all'}
              onChange={(event) => {
                const v = event.target.value
                setFilters((c) => ({ ...c, open: v === 'all' ? undefined : v === 'open' }))
                setOffset(0)
              }}
            >
              <option value="open">Open</option>
              <option value="closed">Done or cancelled</option>
              <option value="all">All</option>
            </SelectField>
            <SelectField
              label="Priority"
              value={filters.priority?.[0] ?? ''}
              onChange={(event) => {
                const v = event.target.value
                setFilters((c) => ({ ...c, priority: v ? [v as Priority] : [] }))
                setOffset(0)
              }}
            >
              <option value="">Any priority</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {humanise(p)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Due"
              value={filters.overdue ? 'overdue' : filters.has_due_date === false ? 'unscheduled' : 'any'}
              onChange={(event) => {
                const v = event.target.value
                setFilters((c) => ({
                  ...c,
                  overdue: v === 'overdue' ? true : undefined,
                  has_due_date: v === 'unscheduled' ? false : undefined,
                }))
                setOffset(0)
              }}
            >
              <option value="any">Any time</option>
              <option value="overdue">Overdue</option>
              <option value="unscheduled">Unscheduled backlog</option>
            </SelectField>
            <SelectField
              label="Source"
              value={filters.origin ?? ''}
              hint="Where the task came from."
              onChange={(event) => {
                const v = event.target.value
                setFilters((c) => ({ ...c, origin: v ? (v as 'user' | 'ai') : undefined }))
                setOffset(0)
              }}
            >
              <option value="">Any source</option>
              <option value="ai">From a suggestion</option>
              <option value="user">Added by hand</option>
            </SelectField>
            <SelectField
              label="Sort"
              value={filters.sort ?? 'due_date'}
              onChange={(event) =>
                setFilters((c) => ({ ...c, sort: event.target.value as TaskSort }))
              }
            >
              <option value="due_date">Due soonest</option>
              <option value="-due_date">Due latest</option>
              <option value="-priority">Priority</option>
              <option value="deal_name">Deal</option>
              <option value="-created_at">Newest</option>
            </SelectField>
          </div>
        </div>

        {list.isPending ? (
          <LoadingBlock label="Loading tasks..." />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <>
            <Table
              columns={columns}
              rows={list.data.items}
              rowKey={(row) => row.id}
              empty={
                anyFilter ? (
                  <EmptyState
                    title="No tasks match"
                    body="Nothing in this slice of the list."
                    actions={
                      <Button
                        size="sm"
                        onClick={() => {
                          setSearch('')
                          setFilters({ open: true, sort: 'due_date' })
                          setOffset(0)
                        }}
                      >
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    title="Nothing to do"
                    body="Tasks are added by hand or created by accepting a recommendation on a deal's Risks tab."
                    actions={
                      <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                        New task
                      </Button>
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
        <TaskForm
          onClose={() => setCreating(false)}
          onSaved={async (task) => {
            await invalidate(task.deal_id)
            setCreating(false)
            toast.success('Task created.')
          }}
        />
      )}

      {editing && (
        <TaskForm
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={async (task) => {
            await invalidate(task.deal_id)
            setEditing(null)
            toast.success('Task updated.')
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Delete "${removing?.title ?? 'task'}"?`}
        confirmLabel="Delete task"
        busy={remove.isPending}
        body={
          <>
            This deletes the task.
            {removing?.origin === 'ai' && (
              <>
                {' '}
                It came from an accepted suggestion, and deleting it does not re-open that
                suggestion &mdash; nothing re-opens a decided recommendation.
              </>
            )}
          </>
        }
        onConfirm={() => removing && remove.mutate({ id: removing.id, dealId: removing.deal_id })}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}
