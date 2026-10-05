import { useState } from 'react'
import { ApiError } from '../../lib/api'
import { clearKey } from '../../lib/formState'
import type { Contact, ContactWrite } from '../../lib/types'
import { Button, Drawer, TextField } from '../../components/ui'

export interface ContactFormProps {
  contact?: Contact
  busy?: boolean
  error?: unknown
  onSubmit: (body: ContactWrite) => void
  onClose: () => void
}

const BLANK: ContactWrite = {
  first_name: '',
  last_name: '',
  email: '',
  title: '',
  phone: '',
}

/**
 * Extract the contact id the duplicate-email 409 names.
 *
 * `services/account.py` writes: "Ada Lovelace already uses a@b.test on this
 * account (contact 7f3e...). Link to that contact instead of creating a
 * duplicate." The id in that sentence is the useful part -- task 1.5 asks for
 * a link to it -- and parsing it out of prose is the only way to get it,
 * because the body carries no structured field for it.
 *
 * Deliberately narrow: it matches the `(contact <uuid>)` shape only, and
 * returns null otherwise, so a reworded message degrades to the sentence
 * without the link rather than to a broken link.
 */
function duplicateContactId(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const match = /\(contact ([0-9a-f-]{36})\)/i.exec(error.message)
  return match ? match[1] : null
}

/**
 * Create or edit a contact (task 1.4).
 *
 * Mounted only while open, so the initial values come from `useState` and
 * there is no reset effect. Resynchronising in a `useEffect` on `open` is
 * what this originally did, and it is the pattern React warns about: setting
 * state in an effect body renders twice and briefly shows the previous
 * record's values. The drawer already handles focus on mount.
 */
export function ContactForm({ contact, busy, error, onSubmit, onClose }: ContactFormProps) {
  const [form, setForm] = useState<ContactWrite>(() =>
    contact
      ? {
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email ?? '',
          title: contact.title ?? '',
          phone: contact.phone ?? '',
        }
      : BLANK,
  )
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof ContactWrite>(key: K, value: ContactWrite[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setLocalErrors((current) => clearKey(current, key))
  }

  const fieldError = (path: keyof ContactWrite) =>
    localErrors[path] ?? (error instanceof ApiError ? error.fieldError(path) : undefined)

  const clean = (value: string | null | undefined) => {
    const trimmed = (value ?? '').trim()
    return trimmed === '' ? null : trimmed
  }

  const handleSubmit = () => {
    // Both names are `min_length=1`. Checked here so an empty box is not a
    // round trip.
    const problems: Record<string, string> = {}
    const first = form.first_name.trim()
    const last = form.last_name.trim()
    if (!first) problems.first_name = 'A first name is required.'
    if (!last) problems.last_name = 'A last name is required.'
    if (Object.keys(problems).length) {
      setLocalErrors(problems)
      return
    }

    const next: ContactWrite = {
      first_name: first,
      last_name: last,
      email: clean(form.email),
      title: clean(form.title),
      phone: clean(form.phone),
    }

    if (!contact) {
      onSubmit(next)
      return
    }

    const changed: Partial<ContactWrite> = {}
    for (const key of Object.keys(next) as (keyof ContactWrite)[]) {
      if (next[key] !== (contact[key] ?? null)) changed[key] = next[key] as never
    }
    if (!Object.keys(changed).length) {
      onClose()
      return
    }
    onSubmit(changed as ContactWrite)
  }

  const duplicateId = duplicateContactId(error)

  return (
    <Drawer
      open
      onClose={onClose}
      title={contact ? 'Edit contact' : 'New contact'}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={busy}>
            {contact ? 'Save' : 'Add contact'}
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
        {/* Task 1.5, the second 409. The server's sentence names the person
            already using this address; the link is what makes it actionable,
            because the right move is almost always to use that contact
            rather than invent a second row for the same human. */}
        {error instanceof ApiError && error.status === 409 && (
          <div className="ui-callout ui-callout--danger">
            {error.message}
            {duplicateId && (
              <>
                {' '}
                <a href={`#contact-${duplicateId}`}>Jump to that contact.</a>
              </>
            )}
          </div>
        )}

        {error instanceof ApiError && error.status !== 409 && error.fields.length === 0 && (
          <div className="ui-callout ui-callout--danger">{error.message}</div>
        )}

        <div className="ui-form-grid">
          <TextField
            label="First name"
            value={form.first_name}
            autoFocus
            maxLength={120}
            error={fieldError('first_name')}
            onChange={(event) => set('first_name', event.target.value)}
          />
          <TextField
            label="Last name"
            value={form.last_name}
            maxLength={120}
            error={fieldError('last_name')}
            onChange={(event) => set('last_name', event.target.value)}
          />
          <div className="ui-span-2">
            <TextField
              label="Email"
              optional
              // Not `type="email"`: the server types this `str` rather than
              // `EmailStr` on purpose, because the transcript-resolution path
              // writes to the same table under the same constraint and
              // `EmailStr` rejects reserved TLDs like `.test`. A browser
              // validator stricter than the API would refuse an address the
              // API accepts -- two rules for one column, which is the drift
              // `services/account.py` exists to prevent.
              type="text"
              value={form.email ?? ''}
              maxLength={320}
              placeholder="ada@northwind.example"
              hint="Optional, because a contact can be created from a name spoken in a transcript. Must be unique on this account when given."
              error={fieldError('email')}
              onChange={(event) => set('email', event.target.value)}
            />
          </div>
          <TextField
            label="Title"
            optional
            value={form.title ?? ''}
            maxLength={200}
            placeholder="VP Engineering"
            error={fieldError('title')}
            onChange={(event) => set('title', event.target.value)}
          />
          <TextField
            label="Phone"
            optional
            value={form.phone ?? ''}
            maxLength={50}
            error={fieldError('phone')}
            onChange={(event) => set('phone', event.target.value)}
          />
        </div>
      </form>
    </Drawer>
  )
}
