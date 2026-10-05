import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { keys, meetings } from '../../lib/queries'
import type { MeetingFilters, MeetingListItem, MeetingWrite } from '../../lib/types'
import {
  formatDateTime,
  formatRelative,
  humanise,
  meetingAnalysisLabel,
  meetingStatusTone,
} from '../../lib/format'
import { errorMessage } from '../../lib/errorMessage'
import type { Column } from '../../components/ui'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  RowActions,
  SelectField,
  Table,
  useToast,
} from '../../components/ui'
import { useDeal } from './dealContext'
import { MeetingForm } from './MeetingForm'
import './deals.css'

/**
 * Phase 7: the meeting track (task 7.1).
 *
 * Newest first, because the track is read to answer "what just happened".
 * The prep queue is the opposite order and is reachable through the Upcoming
 * filter, which maps to the backend's own `upcoming` shorthand rather than a
 * client-side date comparison.
 */
export function MeetingsPage() {
  const deal = useDeal()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [filters, setFilters] = useState<MeetingFilters>({ sort: '-scheduled_at' })
  const [creating, setCreating] = useState(false)

  const list = useQuery({
    queryKey: keys.meetings(deal.id, filters),
    queryFn: () => meetings.list(deal.id, filters),
  })

  const create = useMutation({
    mutationFn: (body: MeetingWrite) => meetings.create(deal.id, body),
    onSuccess: async (meeting) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.meetings(deal.id) }),
        // The deal header carries a `meetings` count.
        queryClient.invalidateQueries({ queryKey: keys.deal(deal.id) }),
      ])
      setCreating(false)
      toast.success(`Created "${meeting.title}".`)
      navigate(`/deals/${deal.id}/meetings/${meeting.id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const columns: Column<MeetingListItem>[] = [
    {
      key: 'title',
      header: 'Meeting',
      render: (row) => (
        <div>
          <div className="deal-cell__name">{row.title}</div>
          <div className="deal-cell__sub">{humanise(row.meeting_type)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={meetingStatusTone(row.status)}>{humanise(row.status)}</Badge>,
    },
    {
      key: 'when',
      header: 'Scheduled',
      render: (row) =>
        row.scheduled_at ? (
          <div>
            <div>{formatDateTime(row.scheduled_at)}</div>
            <div className="deal-cell__sub">{formatRelative(row.scheduled_at)}</div>
          </div>
        ) : (
          <span className="ui-muted">not scheduled</span>
        ),
    },
    {
      key: 'people',
      header: 'People',
      numeric: true,
      render: (row) => row.attendee_count,
    },
    {
      key: 'analysis',
      header: 'Analysis',
      render: (row) => {
        const label = meetingAnalysisLabel(row.analysis_status)
        return (
          <div className="ui-stack" style={{ gap: 'var(--space-1)' }}>
            <Badge tone={label.tone} title={label.explanation}>
              {label.label}
            </Badge>
            {/* Task 7.7's premise, surfaced on the row: no transcript means
                there is nothing for the analyzer to read, which is the real
                reason most meetings sit at "not analysed". */}
            {!row.has_transcript && (
              <span className="deal-cell__sub">no transcript</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: <span className="ui-sr-only">Actions</span>,
      numeric: true,
      render: (row) => (
        <RowActions>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/deals/${deal.id}/meetings/${row.id}`)}
          >
            Open
          </Button>
        </RowActions>
      ),
    },
  ]

  const filtered = filters.upcoming !== undefined || Boolean(filters.status?.length)

  return (
    <div className="ui-stack">
      <Card
        title="Meetings"
        description="The meeting track. Open one for its brief, analysis and attendees."
        actions={
          <div className="documents__filters">
            <SelectField
              label={<span className="ui-sr-only">When</span>}
              value={filters.upcoming === undefined ? 'all' : filters.upcoming ? 'upcoming' : 'past'}
              onChange={(event) => {
                const v = event.target.value
                setFilters((c) => ({
                  ...c,
                  upcoming: v === 'all' ? undefined : v === 'upcoming',
                  // The prep queue reads forwards; the track reads backwards.
                  sort: v === 'upcoming' ? 'scheduled_at' : '-scheduled_at',
                }))
              }}
            >
              <option value="all">All meetings</option>
              <option value="upcoming">Upcoming</option>
              <option value="past">Held or cancelled</option>
            </SelectField>
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              New meeting
            </Button>
          </div>
        }
        flush
      >
        {list.isPending ? (
          <LoadingBlock label="Loading meetings..." />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <Table
            columns={columns}
            rows={list.data}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/deals/${deal.id}/meetings/${row.id}`)}
            empty={
              filtered ? (
                <EmptyState
                  title="Nothing matches"
                  body="No meetings in this slice of the track."
                  actions={
                    <Button size="sm" onClick={() => setFilters({ sort: '-scheduled_at' })}>
                      Show all
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="No meetings yet"
                  body="A meeting is where attendees, briefs and transcripts hang off. Uploading its transcript is what makes it analysable."
                  actions={
                    <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                      Create the first meeting
                    </Button>
                  }
                />
              )
            }
          />
        )}
      </Card>

      {creating && (
        <MeetingForm
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
