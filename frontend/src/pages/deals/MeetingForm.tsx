import { useState } from 'react'
import { ApiError } from '../../lib/api'
import { clearKey } from '../../lib/formState'
import { MEETING_STATUSES, MEETING_TYPES } from '../../lib/types'
import type { MeetingDetail, MeetingStatus, MeetingType, MeetingWrite } from '../../lib/types'
import { humanise } from '../../lib/format'
import { Button, Drawer, SelectField, TextAreaField, TextField } from '../../components/ui'

export interface MeetingFormProps {
  /** Present when editing. */
  meeting?: MeetingDetail
  busy?: boolean
  error?: unknown
  onSubmit: (body: MeetingWrite) => void
  onClose: () => void
}

/** `2026-09-18T16:00:00Z` -> `2026-09-18T16:00`, for a datetime-local input. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * `2026-09-18T16:00` (local) -> an ISO instant.
 *
 * A `datetime-local` value carries no zone, so it has to be interpreted as
 * local time and converted -- sending it raw would be read as UTC and shift
 * every meeting by the user's offset.
 */
function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Tasks 7.1 and 7.2: create or edit a meeting.
 *
 * `summary` and `sentiment` are editable by hand even though the analyzer also
 * writes them -- a salesperson typing their own notes is legitimate, and the
 * backend allows it deliberately. The cost is real and worth knowing: there is
 * **no `origin` column on `meetings`**, so once both a person and the model
 * can write here, "did a human or the analyzer write this summary?" has no
 * answer. So the hint says so rather than pretending the field is neutral.
 */
export function MeetingForm({ meeting, busy, error, onSubmit, onClose }: MeetingFormProps) {
  const [title, setTitle] = useState(meeting?.title ?? '')
  const [meetingType, setMeetingType] = useState<MeetingType>(meeting?.meeting_type ?? 'discovery')
  const [status, setStatus] = useState<MeetingStatus>(meeting?.status ?? 'scheduled')
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(meeting?.scheduled_at ?? null))
  const [startedAt, setStartedAt] = useState(toLocalInput(meeting?.started_at ?? null))
  const [endedAt, setEndedAt] = useState(toLocalInput(meeting?.ended_at ?? null))
  const [summary, setSummary] = useState(meeting?.summary ?? '')
  const [problems, setProblems] = useState<Record<string, string>>({})

  const fieldError = (path: string) =>
    problems[path] ?? (error instanceof ApiError ? error.fieldError(path) : undefined)

  const handleSubmit = () => {
    const next: Record<string, string> = {}
    const trimmed = title.trim()
    if (!trimmed) next.title = 'A title is required.'
    // Mirrors `_ended_after_started` on the server, so the obvious mistake is
    // caught before the round trip.
    if (startedAt && endedAt && new Date(endedAt) < new Date(startedAt)) {
      next.ended_at = 'The end cannot be before the start.'
    }
    if (Object.keys(next).length) {
      setProblems(next)
      return
    }

    const body: MeetingWrite = {
      title: trimmed,
      meeting_type: meetingType,
      status,
      scheduled_at: fromLocalInput(scheduledAt),
      started_at: fromLocalInput(startedAt),
      ended_at: fromLocalInput(endedAt),
      summary: summary.trim() || null,
    }

    if (!meeting) {
      onSubmit(body)
      return
    }

    // Edit: only what changed. `exclude_unset` means a present key is a write.
    const changed: Partial<MeetingWrite> = {}
    if (body.title !== meeting.title) changed.title = body.title
    if (body.meeting_type !== meeting.meeting_type) changed.meeting_type = body.meeting_type
    if (body.status !== meeting.status) changed.status = body.status
    if (body.scheduled_at !== (meeting.scheduled_at ?? null)) changed.scheduled_at = body.scheduled_at
    if (body.started_at !== (meeting.started_at ?? null)) changed.started_at = body.started_at
    if (body.ended_at !== (meeting.ended_at ?? null)) changed.ended_at = body.ended_at
    if (body.summary !== (meeting.summary ?? null)) changed.summary = body.summary

    if (Object.keys(changed).length === 0) {
      onClose()
      return
    }
    onSubmit(changed as MeetingWrite)
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={meeting ? 'Edit meeting' : 'New meeting'}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={busy}>
            {meeting ? 'Save' : 'Create meeting'}
          </Button>
        </>
      }
    >
      <form
        className="ui-stack"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {error instanceof ApiError && error.fields.length === 0 && (
          <div className="ui-callout ui-callout--danger">{error.message}</div>
        )}

        <div className="ui-form-grid">
          <div className="ui-span-2">
            <TextField
              label="Title"
              value={title}
              autoFocus
              maxLength={255}
              placeholder="Security review"
              error={fieldError('title')}
              onChange={(event) => {
                setTitle(event.target.value)
                setProblems((current) => clearKey(current, 'title'))
              }}
            />
          </div>

          <SelectField
            label="Type"
            value={meetingType}
            error={fieldError('meeting_type')}
            onChange={(event) => setMeetingType(event.target.value as MeetingType)}
          >
            {MEETING_TYPES.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Status"
            value={status}
            hint="Attendance only becomes meaningful once this is completed."
            error={fieldError('status')}
            onChange={(event) => setStatus(event.target.value as MeetingStatus)}
          >
            {MEETING_STATUSES.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Scheduled for"
            optional
            type="datetime-local"
            value={scheduledAt}
            error={fieldError('scheduled_at')}
            onChange={(event) => setScheduledAt(event.target.value)}
          />

          <TextField
            label="Started"
            optional
            type="datetime-local"
            value={startedAt}
            error={fieldError('started_at')}
            onChange={(event) => setStartedAt(event.target.value)}
          />

          <TextField
            label="Ended"
            optional
            type="datetime-local"
            value={endedAt}
            error={fieldError('ended_at')}
            onChange={(event) => {
              setEndedAt(event.target.value)
              setProblems((current) => clearKey(current, 'ended_at'))
            }}
          />

          <div className="ui-span-2">
            <TextAreaField
              label="Summary"
              optional
              value={summary}
              hint="Your own notes. The analyzer writes to this same field and meetings carry no origin column, so once both have written here there is no way to tell which did."
              error={fieldError('summary')}
              onChange={(event) => setSummary(event.target.value)}
            />
          </div>
        </div>
      </form>
    </Drawer>
  )
}
