import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { keys, meetings, system } from '../../lib/queries'
import type { MeetingWrite } from '../../lib/types'
import {
  formatDateTime,
  humanise,
  meetingStatusTone,
} from '../../lib/format'
import { errorMessage } from '../../lib/errorMessage'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Definition,
  Definitions,
  ErrorState,
  LoadingBlock,
  useToast,
} from '../../components/ui'
import { useDeal } from './dealContext'
import { MeetingForm } from './MeetingForm'
import { BriefPanel } from './BriefPanel'
import { MeetingAnalysisPanel } from './MeetingAnalysisPanel'
import { AttendeePanel } from './AttendeePanel'
import './deals.css'

/**
 * Task 7.2: one meeting, in three panels -- details, brief, attendees.
 *
 * Analysis gets its own panel beside the brief rather than being folded into
 * details, because the two generated artefacts have different lifecycles: a
 * brief is written once before the meeting and stored, while analysis runs
 * after it and can fail halfway. Putting them side by side is also the honest
 * layout -- both are model output, and the details panel is not.
 */
export function MeetingDetailPage() {
  const deal = useDeal()
  const { meetingId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const meeting = useQuery({
    queryKey: keys.meeting(deal.id, meetingId),
    queryFn: () => meetings.get(deal.id, meetingId),
  })

  // A brief needs a model, unlike the deal's risk detector -- so the panels
  // need to know whether the layer is on before offering to generate one.
  const ai = useQuery({
    queryKey: keys.aiStatus(),
    queryFn: system.aiStatus,
    staleTime: 60_000,
  })

  const update = useMutation({
    mutationFn: (body: Partial<MeetingWrite>) => meetings.update(deal.id, meetingId, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.meeting(deal.id, meetingId) }),
        queryClient.invalidateQueries({ queryKey: keys.meetings(deal.id) }),
      ])
      setEditing(false)
      toast.success('Meeting updated.')
    },
  })

  const remove = useMutation({
    mutationFn: () => meetings.remove(deal.id, meetingId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.meetings(deal.id) }),
        queryClient.invalidateQueries({ queryKey: keys.deal(deal.id) }),
        queryClient.invalidateQueries({ queryKey: keys.dealAnalysis(deal.id) }),
      ])
      toast.success('Meeting deleted.')
      navigate(`/deals/${deal.id}/meetings`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (meeting.isPending) {
    return <LoadingBlock label="Loading meeting..." />
  }

  if (meeting.isError) {
    return (
      <Card>
        <ErrorState
          error={meeting.error}
          onRetry={meeting.refetch}
          title="This meeting could not be loaded"
        />
        <div className="ui-empty__actions" style={{ justifyContent: 'center' }}>
          <Link to={`/deals/${deal.id}/meetings`}>
            <Button>Back to meetings</Button>
          </Link>
        </div>
      </Card>
    )
  }

  const data = meeting.data
  const aiEnabled = ai.data?.config.enabled

  return (
    <div className="ui-stack">
      <div className="meeting-head">
        <div>
          <Link to={`/deals/${deal.id}/meetings`} className="deal-header__back">
            &larr; All meetings
          </Link>
          <h2 className="meeting-head__title">{data.title}</h2>
          <div className="ui-row meeting-head__badges">
            <Badge tone={meetingStatusTone(data.status)}>{humanise(data.status)}</Badge>
            <Badge tone="neutral">{humanise(data.meeting_type)}</Badge>
            {data.has_transcript && <Badge tone="accent">transcript attached</Badge>}
          </div>
        </div>
        <div className="ui-row">
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDeleting(true)}>
            Delete
          </Button>
        </div>
      </div>

      <Card title="Details">
        <Definitions>
          <Definition label="Scheduled">{formatDateTime(data.scheduled_at)}</Definition>
          <Definition label="Started">{formatDateTime(data.started_at)}</Definition>
          <Definition label="Ended">{formatDateTime(data.ended_at)}</Definition>
          <Definition label="Attendees">{data.attendee_count}</Definition>
          <Definition label="Transcript">
            {data.transcript_document_id ? (
              <Link to={`/deals/${deal.id}/documents`}>attached</Link>
            ) : (
              <span className="ui-muted">none</span>
            )}
          </Definition>
        </Definitions>
      </Card>

      <div className="meeting-grid">
        <BriefPanel dealId={deal.id} meetingId={data.id} aiEnabled={aiEnabled} />
        <MeetingAnalysisPanel meeting={data} aiEnabled={aiEnabled} />
      </div>

      <AttendeePanel meeting={data} />

      {editing && (
        <MeetingForm
          meeting={data}
          busy={update.isPending}
          error={update.error}
          onSubmit={(body) => update.mutate(body)}
          onClose={() => {
            setEditing(false)
            update.reset()
          }}
        />
      )}

      <ConfirmDialog
        open={deleting}
        title={`Delete "${data.title}"?`}
        confirmLabel="Delete meeting"
        busy={remove.isPending}
        body={
          <>
            <p>This deletes the meeting, its attendee records and its brief.</p>
            {/* The consequence worth stating: citations that pointed at those
                attendee rows are re-checked and become `span_missing`, so a
                risk grounded in "Dana attended three calls" loses its
                evidence and will show as uncited in the drawer. */}
            <p style={{ marginTop: 'var(--space-3)' }}>
              Any claim grounded in these attendee records loses its evidence &mdash; those
              citations are re-checked and will show as <strong>quote not found</strong> in
              the evidence drawer rather than disappearing quietly. The transcript document
              itself is not deleted.
            </p>
          </>
        }
        onConfirm={() => remove.mutate()}
        onCancel={() => setDeleting(false)}
      />
    </div>
  )
}
