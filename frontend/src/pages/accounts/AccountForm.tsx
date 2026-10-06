import { useState } from 'react'
import { ApiError } from '../../lib/api'
import type { Account, AccountWrite } from '../../lib/types'
import { Button, Drawer, TextField } from '../../components/ui'

export interface AccountFormProps {
  /** Present when editing; absent when creating. */
  account?: Account
  busy?: boolean
  error?: unknown
  onSubmit: (body: AccountWrite) => void
  onClose: () => void
}

/** The server's own words when it named this field, otherwise nothing. */
function fieldError(error: unknown, path: string): string | undefined {
  return error instanceof ApiError ? error.fieldError(path) : undefined
}

const BLANK: AccountWrite = {
  name: '',
  industry: '',
  website: '',
  employee_band: '',
  hq_region: '',
}

/**
 * Create or edit an account (task 1.2).
 *
 * One component for both, because the field list and every validation rule
 * are identical -- only the verb and the starting values differ.
 *
 * Two things the backend's contract forces:
 *
 * 1. `name` is `min_length=1`, so clearing it on a rename is a 422. Checked
 *    before sending, because a round trip to be told the box is empty is a
 *    round trip the user already knew the answer to (1.2).
 * 2. On edit, only *changed* fields are sent. `AccountUpdate` is read with
 *    `model_dump(exclude_unset=True)`, so a key that is present is a write --
 *    sending the whole form back means an unrelated field edited in another
 *    tab is silently overwritten with what this form loaded.
 *
 * Mounted only while open, so the initial values come from `useState` and
 * there is no reset effect. Resynchronising in a `useEffect` on `open` is
 * what this originally did, and it is the pattern React warns about: setting
 * state in an effect body renders twice and briefly shows the previous
 * record's values. The drawer already handles focus on mount.
 */
export function AccountForm({ account, busy, error, onSubmit, onClose }: AccountFormProps) {
  const [form, setForm] = useState<AccountWrite>(() =>
    account
      ? {
          name: account.name,
          industry: account.industry ?? '',
          website: account.website ?? '',
          employee_band: account.employee_band ?? '',
          hq_region: account.hq_region ?? '',
        }
      : BLANK,
  )
  const [nameError, setNameError] = useState<string | null>(null)

  const set = <K extends keyof AccountWrite>(key: K, value: AccountWrite[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  /**
   * An empty optional field is sent as `null`, not `''`.
   *
   * Every one of these columns is nullable, and `exclude_unset` means `null`
   * is the only way to *clear* one -- so a user who deletes the contents of
   * "Website" means "there is no website", and an empty string would store
   * that as a website that happens to be blank.
   */
  const clean = (value: string | null | undefined) => {
    const trimmed = (value ?? '').trim()
    return trimmed === '' ? null : trimmed
  }

  const handleSubmit = () => {
    const name = form.name.trim()
    if (!name) {
      setNameError('A name is required.')
      return
    }

    const next: AccountWrite = {
      name,
      industry: clean(form.industry),
      website: clean(form.website),
      employee_band: clean(form.employee_band),
      hq_region: clean(form.hq_region),
    }

    if (!account) {
      onSubmit(next)
      return
    }

    // Edit: send the difference only. See the note above.
    const changed: Partial<AccountWrite> = {}
    for (const key of Object.keys(next) as (keyof AccountWrite)[]) {
      const before = account[key as keyof Account] ?? null
      if (next[key] !== before) {
        changed[key] = next[key] as never
      }
    }
    if (Object.keys(changed).length === 0) {
      onClose()
      return
    }
    onSubmit(changed as AccountWrite)
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={account ? 'Edit account' : 'New account'}
      description={
        account
          ? undefined
          : 'An account is what a deal and a contact hang off, so this is the first thing a fresh install needs.'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={busy}>
            {account ? 'Save' : 'Create account'}
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
        {/* A refusal that is not about one field: the server's sentence, kept
            on screen rather than toasted. */}
        {error instanceof ApiError && error.fields.length === 0 && (
          <div className="ui-callout ui-callout--danger">{error.message}</div>
        )}

        <div className="ui-form-grid">
          <div className="ui-span-2">
            <TextField
              label="Name"
              value={form.name}
              autoFocus
              maxLength={255}
              placeholder="Northwind Industries"
              error={nameError ?? fieldError(error, 'name')}
              onChange={(event) => {
                set('name', event.target.value)
                if (nameError) setNameError(null)
              }}
            />
          </div>

          <TextField
            label="Industry"
            optional
            value={form.industry ?? ''}
            maxLength={255}
            placeholder="Manufacturing"
            error={fieldError(error, 'industry')}
            onChange={(event) => set('industry', event.target.value)}
          />
          <TextField
            label="HQ region"
            optional
            value={form.hq_region ?? ''}
            maxLength={100}
            placeholder="EMEA"
            error={fieldError(error, 'hq_region')}
            onChange={(event) => set('hq_region', event.target.value)}
          />
          <TextField
            label="Website"
            optional
            value={form.website ?? ''}
            maxLength={255}
            placeholder="northwind.example"
            error={fieldError(error, 'website')}
            onChange={(event) => set('website', event.target.value)}
          />
          <TextField
            label="Employee band"
            optional
            value={form.employee_band ?? ''}
            maxLength={50}
            placeholder="500-1000"
            error={fieldError(error, 'employee_band')}
            onChange={(event) => set('employee_band', event.target.value)}
          />
        </div>
      </form>
    </Drawer>
  )
}
