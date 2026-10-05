import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../lib/api'
import { clearKey } from '../../lib/formState'
import { splitName } from './splitName'
import { contacts, keys } from '../../lib/queries'
import type { AttendeeResolve, MeetingAttendee } from '../../lib/types'
import { Button, Drawer, SelectField, TextField } from '../../components/ui'

export interface ResolveDialogProps {
  attendee: MeetingAttendee
  /** The deal's account -- contacts belong to it, not to the deal. */
  accountId: string
  busy?: boolean
  error?: unknown
  onSubmit: (body: AttendeeResolve) => void
  onClose: () => void
}

/**
 * Task 7.6: resolve an attendee to a contact.
 *
 * The plan calls this "the main way contacts get created in practice", and
 * that is why it exists as its own flow rather than sending people to the
 * Accounts page: the name already exists as a transcript speaker, and the
 * useful gesture is to promote it in place.
 *
 * `AttendeeResolve` requires **exactly one** of `contact_id` or `contact`, so
 * the two modes are a real either/or rather than a form with optional halves
 * -- sending both is a 422.
 *
 * The optional stakeholder half is deliberately not offered here. The resolve
 * endpoint can write a `deal_contacts` row in the same transaction, but
 * `deal_contacts` has no `origin` column, so a `buying_role` set here would
 * be indistinguishable from one the analyzer inferred. Phase 8 owns that
 * screen; promoting someone to a stakeholder is one click away there, with
 * the fields it actually needs.
 */
export function ResolveDialog({
  attendee,
  accountId,
  busy,
  error,
  onSubmit,
  onClose,
}: ResolveDialogProps) {
  const guess = splitName(attendee.raw_name)
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [contactId, setContactId] = useState('')
  const [firstName, setFirstName] = useState(guess.first)
  const [lastName, setLastName] = useState(guess.last)
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState('')
  const [problems, setProblems] = useState<Record<string, string>>({})

  const contactList = useQuery({
    queryKey: keys.contacts(accountId),
    queryFn: () => contacts.list(accountId),
  })

  const fieldError = (path: string) =>
    problems[path] ?? (error instanceof ApiError ? error.fieldError(path) : undefined)

  const handleSubmit = () => {
    const next: Record<string, string> = {}
    if (mode === 'existing') {
      if (!contactId) next.contact_id = 'Pick the person this name refers to.'
    } else {
      if (!firstName.trim()) next.first_name = 'A first name is required.'
      if (!lastName.trim()) next.last_name = 'A last name is required.'
    }
    if (Object.keys(next).length) {
      setProblems(next)
      return
    }

    onSubmit(
      mode === 'existing'
        ? { contact_id: contactId, force: attendee.resolved || undefined }
        : {
            contact: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim() || null,
              title: title.trim() || null,
            },
            force: attendee.resolved || undefined,
          },
    )
  }

  /**
   * The three refusals, each with a next step the status code does not carry.
   *
   * 422 for an internal attendee is a judgement about the data rather than
   * the request: your own people are not customer contacts, and the fix is to
   * clear `is_internal` if the flag is wrong.
   */
  const refusal = (() => {
    if (!(error instanceof ApiError)) return null
    if (error.status === 422 && error.fields.length === 0) {
      return { tone: 'warn' as const, body: error.message }
    }
    if (error.status === 409) {
      return { tone: 'warn' as const, body: error.message }
    }
    if (error.fields.length === 0) {
      return { tone: 'danger' as const, body: error.message }
    }
    return null
  })()

  const candidates = contactList.data ?? []

  return (
    <Drawer
      open
      onClose={onClose}
      title={attendee.resolved ? 'Re-point this attendee' : 'Resolve this attendee'}
      description={attendee.raw_name}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={busy}>
            {mode === 'existing' ? 'Link contact' : 'Create and link'}
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
        {refusal && (
          <div className={`ui-callout ui-callout--${refusal.tone}`}>{refusal.body}</div>
        )}

        <p className="ui-muted dismiss__intro">
          This is the name as it appeared in the transcript or invite. Linking it to a
          contact is what turns an unresolved speaker into a tracked person &mdash; and an
          unresolved attendee is the raw signal behind &ldquo;missing stakeholder&rdquo;,
          so this is worth doing rather than tidying away.
        </p>

        <fieldset className="dismiss__reasons">
          <legend className="ui-field__label">Who is this?</legend>
          <label className="dismiss__reason">
            <input
              type="radio"
              name="resolve-mode"
              checked={mode === 'existing'}
              onChange={() => {
                setMode('existing')
                setProblems({})
              }}
            />
            <span>
              <span className="dismiss__reason-name">Someone already on this account</span>
              <span className="dismiss__reason-help">
                {candidates.length} contact{candidates.length === 1 ? '' : 's'} known.
              </span>
            </span>
          </label>
          <label className="dismiss__reason">
            <input
              type="radio"
              name="resolve-mode"
              checked={mode === 'new'}
              onChange={() => {
                setMode('new')
                setProblems({})
              }}
            />
            <span>
              <span className="dismiss__reason-name">A new person</span>
              <span className="dismiss__reason-help">
                Creates the contact on this deal&rsquo;s account and links it, in one
                transaction.
              </span>
            </span>
          </label>
        </fieldset>

        {mode === 'existing' ? (
          <SelectField
            label="Contact"
            value={contactId}
            disabled={contactList.isPending || candidates.length === 0}
            error={fieldError('contact_id')}
            hint={
              candidates.length === 0
                ? 'No contacts on this account yet -- create a new person instead.'
                : undefined
            }
            onChange={(event) => {
              setContactId(event.target.value)
              setProblems((c) => clearKey(c, 'contact_id'))
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
        ) : (
          <div className="ui-form-grid">
            <TextField
              label="First name"
              value={firstName}
              maxLength={120}
              error={fieldError('first_name')}
              onChange={(event) => {
                setFirstName(event.target.value)
                setProblems((c) => clearKey(c, 'first_name'))
              }}
            />
            <TextField
              label="Last name"
              value={lastName}
              maxLength={120}
              error={fieldError('last_name')}
              onChange={(event) => {
                setLastName(event.target.value)
                setProblems((c) => clearKey(c, 'last_name'))
              }}
            />
            <div className="ui-span-2">
              <TextField
                label="Email"
                optional
                type="text"
                value={email}
                maxLength={320}
                hint="Optional, and usually unknown for a transcript speaker -- which is exactly why this path does not require it. A duplicate on this account is a 409."
                error={fieldError('email')}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="ui-span-2">
              <TextField
                label="Title"
                optional
                value={title}
                maxLength={200}
                error={fieldError('title')}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
          </div>
        )}

        {/* Phase 8's job, flagged rather than done here. See the component
            docstring for why this is not a field on this form. */}
        <p className="ui-muted brief__meta">
          Resolving does not make this person a stakeholder on the deal. That is a
          separate decision, with its own fields, on the People tab.
        </p>
      </form>
    </Drawer>
  )
}
