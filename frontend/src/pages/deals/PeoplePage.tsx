import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { contacts, keys, participants, stakeholders } from '../../lib/queries'
import {
  BUYING_ROLES,
  INFLUENCE_LEVELS,
  SENTIMENTS,
} from '../../lib/types'
import type {
  BuyingRole,
  DealParticipant,
  DealStakeholder,
  InfluenceLevel,
  Sentiment,
  StakeholderCreate,
  StakeholderWrite,
} from '../../lib/types'
import { EMPTY, formatRelative, humanise, sentimentTone } from '../../lib/format'
import { errorMessage } from '../../lib/errorMessage'
import type { BadgeTone, Column } from '../../components/ui'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  LoadingBlock,
  RowActions,
  SelectField,
  Table,
  TextAreaField,
  useToast,
} from '../../components/ui'
import { useDeal } from './dealContext'
import './deals.css'

/**
 * Influence -> tone.
 *
 * `high` is `info`, not `danger`: a high-influence stakeholder is an asset or a
 * threat depending on `buying_role`, and colouring influence alone as a warning
 * would assert a judgement the field does not carry. The one genuinely negative
 * role is `blocker`, which is where the red goes.
 */
function influenceTone(influence: InfluenceLevel): BadgeTone {
  if (influence === 'high') return 'info'
  if (influence === 'unknown') return 'neutral'
  return 'neutral'
}

function roleTone(role: BuyingRole): BadgeTone {
  if (role === 'blocker') return 'danger'
  if (role === 'economic_buyer' || role === 'champion') return 'accent'
  return 'neutral'
}

/**
 * Phase 8: who is on this deal, and -- more useful -- who is in the room and
 * not tracked.
 *
 * The participants roll-up is one of two features that deliver real value with
 * **zero model calls**: it is a join over `meeting_attendees`, so it works
 * with the AI layer switched off entirely.
 *
 * **Nothing here is labelled as human- or model-authored, deliberately.**
 * `deal_contacts` has no `origin` column, so once both a person and the
 * analyzer can write `buying_role` or `sentiment` there is no way to tell
 * which did. The plan is explicit: do not label these values as either until
 * that column exists.
 */
export function PeoplePage() {
  const deal = useDeal()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [editing, setEditing] = useState<DealStakeholder | null>(null)
  const [adding, setAdding] = useState<{ contactId?: string; name?: string } | null>(null)
  const [removing, setRemoving] = useState<DealStakeholder | null>(null)

  const list = useQuery({
    queryKey: keys.stakeholders(deal.id),
    queryFn: () => stakeholders.list(deal.id),
  })

  const roll = useQuery({
    queryKey: keys.participants(deal.id),
    // `is_internal` defaults to false server-side: your own people are not
    // deal participants in the sense this list means.
    queryFn: () => participants.list(deal.id),
  })

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.stakeholders(deal.id) }),
      queryClient.invalidateQueries({ queryKey: keys.participants(deal.id) }),
      // The header carries a `stakeholders` count, and the detector reads
      // these rows for `single_threaded` / `no_economic_buyer`.
      queryClient.invalidateQueries({ queryKey: keys.deal(deal.id) }),
      queryClient.invalidateQueries({ queryKey: keys.dealAnalysis(deal.id) }),
    ])

  const add = useMutation({
    mutationFn: (body: StakeholderCreate) => stakeholders.create(deal.id, body),
    onSuccess: async () => {
      await invalidate()
      setAdding(null)
      toast.success('Stakeholder added.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const update = useMutation({
    mutationFn: ({ contactId, body }: { contactId: string; body: StakeholderWrite }) =>
      stakeholders.update(deal.id, contactId, body),
    onSuccess: async () => {
      await invalidate()
      setEditing(null)
      toast.success('Stakeholder updated.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: (contactId: string) => stakeholders.remove(deal.id, contactId),
    onSuccess: async () => {
      await invalidate()
      setRemoving(null)
      toast.success('Stakeholder removed.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const columns: Column<DealStakeholder>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div>
          <div className="deal-cell__name">
            {row.first_name} {row.last_name}
            {row.is_primary && (
              <Badge tone="accent" title="The main contact on this deal.">
                primary
              </Badge>
            )}
          </div>
          <div className="deal-cell__sub">{row.title || EMPTY}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Buying role',
      render: (row) => <Badge tone={roleTone(row.buying_role)}>{humanise(row.buying_role)}</Badge>,
    },
    {
      key: 'influence',
      header: 'Influence',
      render: (row) =>
        row.influence === 'unknown' ? (
          <span className="ui-muted">unknown</span>
        ) : (
          <Badge tone={influenceTone(row.influence)}>{humanise(row.influence)}</Badge>
        ),
    },
    {
      key: 'sentiment',
      header: 'Sentiment',
      render: (row) =>
        row.sentiment === 'unknown' ? (
          <span className="ui-muted">unknown</span>
        ) : (
          <Badge tone={sentimentTone(row.sentiment)}>{humanise(row.sentiment)}</Badge>
        ),
    },
    {
      key: 'meetings',
      header: 'Meetings',
      numeric: true,
      render: (row) => {
        // Attendance comes from the roll-up, not from `deal_contacts`. A
        // stakeholder with zero attendance is the signal the plan cares about:
        // for an economic buyer that *is* the no_economic_buyer risk.
        const match = roll.data?.find((p) => p.contact_id === row.contact_id)
        const count = match?.meetings_attended ?? 0
        return count === 0 ? (
          <span
            className="ui-muted"
            title="Tracked on this deal but has never attended a meeting."
          >
            never
          </span>
        ) : (
          count
        )
      },
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
            Remove
          </Button>
        </RowActions>
      ),
    },
  ]

  // Task 8.4: people who turned up and are not tracked. Resolved only --
  // an unresolved attendee has no `contact_id`, so there is nothing to
  // promote; those are handled on the meeting's own page (phase 7).
  const untracked = (roll.data ?? []).filter((p) => !p.is_stakeholder)

  return (
    <div className="ui-stack">
      <Card
        title="Stakeholders"
        description="Who we are tracking on this deal, and what we think their position is."
        actions={
          <Button variant="primary" size="sm" onClick={() => setAdding({})}>
            Add stakeholder
          </Button>
        }
        flush
      >
        {list.isPending ? (
          <LoadingBlock label="Loading stakeholders..." />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <Table
            columns={columns}
            rows={list.data}
            rowKey={(row) => row.contact_id}
            empty={
              <EmptyState
                title="No stakeholders tracked"
                body="A stakeholder is a contact on this account plus what we believe about them. With none tracked, the detector cannot tell whether there is an economic buyer."
                actions={
                  <Button variant="primary" size="sm" onClick={() => setAdding({})}>
                    Add the first stakeholder
                  </Button>
                }
              />
            }
          />
        )}
      </Card>

      <Card
        title="In meetings but not tracked"
        description="Rolled up across every meeting on this deal. No model involved -- this is a join over attendance."
        flush
      >
        {roll.isPending ? (
          <LoadingBlock label="Loading participants..." />
        ) : roll.isError ? (
          <ErrorState error={roll.error} onRetry={roll.refetch} />
        ) : untracked.length === 0 ? (
          <EmptyState
            title="Everyone in the room is tracked"
            body="Every external person who has attended a meeting on this deal is also a stakeholder."
          />
        ) : (
          <ul className="attendee-list participant-list">
            {untracked.map((person) => (
              <ParticipantRow
                key={person.contact_id ?? person.name}
                person={person}
                dealId={deal.id}
                onPromote={() =>
                  setAdding({ contactId: person.contact_id ?? undefined, name: person.name })
                }
              />
            ))}
          </ul>
        )}
      </Card>

      {adding && (
        <StakeholderForm
          accountId={deal.account.id}
          presetContactId={adding.contactId}
          presetName={adding.name}
          existing={list.data ?? []}
          busy={add.isPending}
          error={add.error}
          onSubmit={(body) => add.mutate(body)}
          onClose={() => {
            setAdding(null)
            add.reset()
          }}
        />
      )}

      {editing && (
        <StakeholderForm
          accountId={deal.account.id}
          stakeholder={editing}
          existing={list.data ?? []}
          busy={update.isPending}
          error={update.error}
          onSubmit={(body) => update.mutate({ contactId: editing.contact_id, body })}
          onClose={() => {
            setEditing(null)
            update.reset()
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.first_name ?? ''} ${removing?.last_name ?? ''}?`}
        confirmLabel="Remove stakeholder"
        busy={remove.isPending}
        body={
          <>
            This removes them from this deal&rsquo;s stakeholder map, along with the buying
            role, influence and sentiment recorded here. The contact stays on the account,
            and their meeting attendance is untouched &mdash; so they will reappear below as
            someone in the room who is not tracked.
          </>
        }
        onConfirm={() => removing && remove.mutate(removing.contact_id)}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

function ParticipantRow({
  person,
  dealId,
  onPromote,
}: {
  person: DealParticipant
  dealId: string
  onPromote: () => void
}) {
  return (
    <li className="attendee">
      <div className="attendee__who">
        <span className="attendee__name">{person.name}</span>
        {!person.resolved && (
          <Badge tone="warn" title="This name maps to no contact, so there is nobody to track yet.">
            unresolved
          </Badge>
        )}
        <div className="attendee__meta">
          {person.title && <span>{person.title}</span>}
          {person.email && <span>{person.email}</span>}
          <span>
            {person.meetings_attended} meeting{person.meetings_attended === 1 ? '' : 's'}
          </span>
          {person.last_seen_at && <span>last seen {formatRelative(person.last_seen_at)}</span>}
        </div>
      </div>
      <div className="attendee__actions">
        {/* Task 8.5. Only possible once the name resolves to a contact --
            `POST /stakeholders` needs a `contact_id`, so an unresolved
            participant has to be resolved on its meeting first. */}
        {person.resolved && person.contact_id ? (
          <Button size="sm" variant="primary" onClick={onPromote}>
            Add as stakeholder
          </Button>
        ) : (
          <Link to={`/deals/${dealId}/meetings`}>
            <Button size="sm" variant="ghost">
              Resolve first
            </Button>
          </Link>
        )}
      </div>
    </li>
  )
}

interface StakeholderFormProps {
  accountId: string
  stakeholder?: DealStakeholder
  presetContactId?: string
  presetName?: string
  existing: DealStakeholder[]
  busy?: boolean
  error?: unknown
  onSubmit: (body: StakeholderCreate) => void
  onClose: () => void
}

/** Tasks 8.2 and 8.3: add via a contact picker, edit the selling metadata. */
function StakeholderForm({
  accountId,
  stakeholder,
  presetContactId,
  presetName,
  existing,
  busy,
  error,
  onSubmit,
  onClose,
}: StakeholderFormProps) {
  const [contactId, setContactId] = useState(presetContactId ?? stakeholder?.contact_id ?? '')
  const [buyingRole, setBuyingRole] = useState<BuyingRole>(stakeholder?.buying_role ?? 'unknown')
  const [influence, setInfluence] = useState<InfluenceLevel>(stakeholder?.influence ?? 'unknown')
  const [sentiment, setSentiment] = useState<Sentiment>(stakeholder?.sentiment ?? 'unknown')
  const [isPrimary, setIsPrimary] = useState(stakeholder?.is_primary ?? false)
  const [notes, setNotes] = useState(stakeholder?.notes ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const contactList = useQuery({
    queryKey: keys.contacts(accountId),
    queryFn: () => contacts.list(accountId),
    enabled: !stakeholder,
  })

  // Someone already tracked cannot be added twice -- the (deal, contact) pair
  // is the primary key, so the server would answer 409. Filtered out instead.
  const tracked = new Set(existing.map((s) => s.contact_id))
  const candidates = (contactList.data ?? []).filter(
    (c) => !tracked.has(c.id) || c.id === presetContactId,
  )

  const handleSubmit = () => {
    if (!stakeholder && !contactId) {
      setProblem('Pick the contact this stakeholder is.')
      return
    }
    onSubmit({
      contact_id: contactId,
      buying_role: buyingRole,
      influence,
      sentiment,
      is_primary: isPrimary,
      notes: notes.trim() || null,
    })
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={stakeholder ? 'Edit stakeholder' : 'Add stakeholder'}
      description={
        stakeholder
          ? `${stakeholder.first_name} ${stakeholder.last_name}`
          : presetName
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={busy}>
            {stakeholder ? 'Save' : 'Add'}
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
        {error ? <div className="ui-callout ui-callout--danger">{errorMessage(error)}</div> : null}

        {!stakeholder && (
          <SelectField
            label="Contact"
            value={contactId}
            disabled={contactList.isPending || candidates.length === 0}
            error={problem ?? undefined}
            hint={
              candidates.length === 0 && !contactList.isPending
                ? 'Every contact on this account is already tracked. Add a contact on the account first.'
                : 'A stakeholder is a contact on this deal’s account.'
            }
            onChange={(event) => {
              setContactId(event.target.value)
              setProblem(null)
            }}
          >
            <option value="">
              {contactList.isPending ? 'Loading contacts...' : 'Select a contact'}
            </option>
            {candidates.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.first_name} {contact.last_name}
                {contact.title ? ` -- ${contact.title}` : ''}
              </option>
            ))}
          </SelectField>
        )}

        {/* The honesty note for this whole screen. `deal_contacts` has no
            `origin`, so these three values cannot be attributed. Said once,
            here, where they are being set. */}
        <div className="ui-callout ui-callout--info">
          These three judgements can be written by hand or inferred by the analyzer, and{' '}
          <code>deal_contacts</code> records no author &mdash; so once set, there is no way
          to tell which did. Treat them as the deal&rsquo;s current working view.
        </div>

        <div className="ui-form-grid">
          <SelectField
            label="Buying role"
            value={buyingRole}
            onChange={(event) => setBuyingRole(event.target.value as BuyingRole)}
          >
            {BUYING_ROLES.map((role) => (
              <option key={role} value={role}>
                {humanise(role)}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Influence"
            value={influence}
            onChange={(event) => setInfluence(event.target.value as InfluenceLevel)}
          >
            {INFLUENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {humanise(level)}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Sentiment"
            value={sentiment}
            onChange={(event) => setSentiment(event.target.value as Sentiment)}
          >
            {SENTIMENTS.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </SelectField>

          <div className="ui-field">
            <span className="ui-field__label">Primary contact</span>
            <label className="dismiss__reason">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(event) => setIsPrimary(event.target.checked)}
              />
              <span>
                <span className="dismiss__reason-name">Main contact on this deal</span>
              </span>
            </label>
          </div>

          <div className="ui-span-2">
            <TextAreaField
              label="Notes"
              optional
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
      </form>
    </Drawer>
  )
}
