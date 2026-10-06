import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { attendees, keys } from '../../lib/queries'
import type { AttendeeResolve, AttendeeWrite, MeetingAttendee, MeetingDetail } from '../../lib/types'
import { errorMessage } from '../../lib/errorMessage'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  TextField,
  useToast,
} from '../../components/ui'
import { ResolveDialog } from './ResolveDialog'

export interface AttendeePanelProps {
  meeting: MeetingDetail
}

function AttendeeRow({
  attendee,
  completed,
  onResolve,
  onRemove,
}: {
  attendee: MeetingAttendee
  completed: boolean
  onResolve: () => void
  onRemove: () => void
}) {
  return (
    <li className="attendee">
      <div className="attendee__who">
        <span className="attendee__name">{attendee.raw_name}</span>
        {attendee.resolved && attendee.contact_name && attendee.contact_name !== attendee.raw_name && (
          <span className="ui-muted attendee__alias">&rarr; {attendee.contact_name}</span>
        )}
        <div className="attendee__meta">
          {attendee.contact_title && <span>{attendee.contact_title}</span>}
          {attendee.contact_email && <span>{attendee.contact_email}</span>}
          {/* `attended` only means something once the meeting is completed --
              on a scheduled one the column really holds "invited", which it
              cannot distinguish. So the label follows the meeting's status
              rather than asserting attendance at a meeting that has not
              happened. */}
          <span>{completed ? (attendee.attended ? 'attended' : 'did not attend') : 'invited'}</span>
        </div>
      </div>

      <div className="attendee__actions">
        {attendee.is_internal ? (
          <Badge tone="neutral" title="Your own people. Not resolvable to a customer contact.">
            internal
          </Badge>
        ) : attendee.resolved ? (
          <>
            <Badge tone="ok">resolved</Badge>
            <Button size="sm" variant="ghost" onClick={onResolve}>
              Re-point
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={onResolve}>
            Resolve
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </li>
  )
}

/**
 * Tasks 7.5 and 7.6: attendees, with resolved and unresolved clearly apart.
 *
 * The split is the point of the panel. An unresolved attendee is not a
 * data-entry oversight to be tidied away -- it is the raw signal for "someone
 * is influencing this deal and nobody is tracking them", which is what feeds
 * `single_threaded` and `no_economic_buyer`. So the unresolved group comes
 * first, says why it matters, and carries the primary action.
 *
 * Internal attendees are listed with the resolved group and are not
 * resolvable: the endpoint answers 422 for them, because your own people are
 * not customer contacts.
 */
export function AttendeePanel({ meeting }: AttendeePanelProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [resolving, setResolving] = useState<MeetingAttendee | null>(null)
  const [removing, setRemoving] = useState<MeetingAttendee | null>(null)
  const [newName, setNewName] = useState('')

  const list = useQuery({
    queryKey: keys.attendees(meeting.deal_id, meeting.id),
    queryFn: () => attendees.list(meeting.deal_id, meeting.id),
  })

  /**
   * Resolving changes more than this list.
   *
   * It can create a contact (so the account's contact list and the accounts
   * table's `contact_count` move) and it marks the deal dirty, so the
   * analysis badge is stale. The participants roll-up phase 8 reads is
   * derived from these rows too.
   */
  const invalidateAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.attendees(meeting.deal_id, meeting.id) }),
      queryClient.invalidateQueries({ queryKey: keys.meeting(meeting.deal_id, meeting.id) }),
      queryClient.invalidateQueries({ queryKey: keys.meetings(meeting.deal_id) }),
      queryClient.invalidateQueries({ queryKey: keys.deal(meeting.deal_id) }),
      queryClient.invalidateQueries({ queryKey: keys.dealAnalysis(meeting.deal_id) }),
      queryClient.invalidateQueries({ queryKey: keys.accounts() }),
      queryClient.invalidateQueries({ queryKey: keys.account(meeting.account_id) }),
    ])

  const resolve = useMutation({
    mutationFn: ({ attendeeId, body }: { attendeeId: string; body: AttendeeResolve }) =>
      attendees.resolve(meeting.deal_id, meeting.id, attendeeId, body),
    onSuccess: async (attendee) => {
      await invalidateAll()
      setResolving(null)
      toast.success(`${attendee.raw_name} is now ${attendee.contact_name ?? 'linked'}.`)
    },
    // Failures stay in the dialog: all three carry a next step.
  })

  const add = useMutation({
    mutationFn: (body: AttendeeWrite) => attendees.create(meeting.deal_id, meeting.id, body),
    onSuccess: async () => {
      await invalidateAll()
      setNewName('')
      toast.success('Attendee added.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: (attendeeId: string) =>
      attendees.remove(meeting.deal_id, meeting.id, attendeeId),
    onSuccess: async () => {
      await invalidateAll()
      setRemoving(null)
      toast.success('Attendee removed.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const rows = list.data ?? []
  const unresolved = rows.filter((a) => !a.resolved && !a.is_internal)
  const known = rows.filter((a) => a.resolved || a.is_internal)
  const completed = meeting.status === 'completed'

  return (
    <>
      <Card
        title="Attendees"
        description="Who was on the call, and which of those names map to people we track."
      >
        {list.isPending ? (
          <LoadingBlock label="Loading attendees..." />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nobody recorded"
            body="Attendees come from the invite or from transcript speaker labels. Add one by hand below."
          />
        ) : (
          <div className="ui-stack">
            {unresolved.length > 0 && (
              <div>
                <h4 className="brief__heading">
                  Unresolved
                  <Badge tone="warn">{unresolved.length}</Badge>
                </h4>
                <p className="ui-muted attendee__why">
                  These names map to nobody we track. That is the signal behind
                  &ldquo;single threaded&rdquo; and &ldquo;no economic buyer&rdquo;, so
                  resolving them is what makes the stakeholder map real.
                </p>
                <ul className="attendee-list">
                  {unresolved.map((attendee) => (
                    <AttendeeRow
                      key={attendee.id}
                      attendee={attendee}
                      completed={completed}
                      onResolve={() => setResolving(attendee)}
                      onRemove={() => setRemoving(attendee)}
                    />
                  ))}
                </ul>
              </div>
            )}

            {known.length > 0 && (
              <div>
                <h4 className="brief__heading">Known</h4>
                <ul className="attendee-list">
                  {known.map((attendee) => (
                    <AttendeeRow
                      key={attendee.id}
                      attendee={attendee}
                      completed={completed}
                      onResolve={() => setResolving(attendee)}
                      onRemove={() => setRemoving(attendee)}
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <form
          className="attendee__add"
          onSubmit={(event) => {
            event.preventDefault()
            const name = newName.trim()
            if (name) add.mutate({ raw_name: name })
          }}
        >
          <TextField
            label="Add someone"
            value={newName}
            placeholder="Name as it appeared"
            hint="Recorded as an unresolved attendee, which you can then resolve to a contact."
            onChange={(event) => setNewName(event.target.value)}
          />
          <Button type="submit" loading={add.isPending} disabled={!newName.trim()}>
            Add
          </Button>
        </form>
      </Card>

      {resolving && (
        <ResolveDialog
          attendee={resolving}
          accountId={meeting.account_id}
          busy={resolve.isPending}
          error={resolve.error}
          onSubmit={(body) => resolve.mutate({ attendeeId: resolving.id, body })}
          onClose={() => {
            setResolving(null)
            resolve.reset()
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.raw_name ?? 'attendee'}?`}
        confirmLabel="Remove"
        busy={remove.isPending}
        body={
          <>
            This removes the attendance record for this meeting. It never deletes the
            contact{removing?.contact_name ? ` (${removing.contact_name})` : ''}, who stays
            on the account and on any other meeting they attended.
          </>
        }
        onConfirm={() => removing && remove.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}
