import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError } from '../../lib/api'
import { clearKey } from '../../lib/formState'
import { accounts, keys } from '../../lib/queries'
import { DEAL_STAGES } from '../../lib/types'
import type { DealCreate, DealStage } from '../../lib/types'
import { humanise } from '../../lib/format'
import { Button, Drawer, SelectField, TextField } from '../../components/ui'

export interface DealCreateFormProps {
  busy?: boolean
  error?: unknown
  /** Preselects the account, when opened from an account page. */
  accountId?: string
  onSubmit: (body: DealCreate) => void
  onClose: () => void
}

interface FormState {
  account_id: string
  name: string
  stage: DealStage
  value: string
  currency: string
  win_probability: string
  expected_close_date: string
}

const BLANK: FormState = {
  account_id: '',
  name: '',
  // `stage` is required and the server has no default on purpose -- a deal
  // created at the wrong stage corrupts both the pipeline view and stage
  // history. `qualification` is the honest first stage rather than a guess,
  // and the select is right there.
  stage: 'qualification',
  value: '',
  currency: 'USD',
  win_probability: '',
  expected_close_date: '',
}

/**
 * Task 2.3. The account picker reads phase 1.
 *
 * Mounted only while open, so the initial values come from `useState` and
 * there is no reset effect. Resynchronising in a `useEffect` on `open` is
 * what this originally did, and it is the pattern React warns about: setting
 * state in an effect body renders twice and briefly shows the previous
 * record's values. The drawer already handles focus on mount.
 */
export function DealCreateForm({
  busy,
  error,
  accountId,
  onSubmit,
  onClose,
}: DealCreateFormProps) {
  const [form, setForm] = useState<FormState>(() => ({
    ...BLANK,
    account_id: accountId ?? '',
  }))
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  // The picker. `limit` is the server's maximum, because this is a
  // `<select>` and paging one is not a thing -- a longer account list wants a
  // typeahead, which is a different control and not needed at MVP volume.
  const accountOptions = useQuery({
    queryKey: keys.accounts({ limit: 200, offset: 0 }),
    queryFn: () => accounts.list({ limit: 200, offset: 0 }),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setLocalErrors((current) => clearKey(current, key))
  }

  const fieldError = (path: string) =>
    localErrors[path] ?? (error instanceof ApiError ? error.fieldError(path) : undefined)

  const handleSubmit = () => {
    const problems: Record<string, string> = {}
    const name = form.name.trim()
    if (!name) problems.name = 'A name is required.'
    if (!form.account_id) problems.account_id = 'Pick the account this deal belongs to.'

    const probability = form.win_probability.trim()
    if (probability !== '') {
      const parsed = Number(probability)
      // Mirrors the `win_probability_range` CHECK on the model.
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        problems.win_probability = 'A whole number between 0 and 100.'
      }
    }

    const amount = form.value.trim()
    if (amount !== '' && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) {
      problems.value = 'A positive amount, or leave it empty.'
    }

    if (Object.keys(problems).length) {
      setLocalErrors(problems)
      return
    }

    onSubmit({
      account_id: form.account_id,
      name,
      stage: form.stage,
      // `Numeric(14, 2)` on the server, so the value is sent as a string and
      // never as a float -- JSON numbers lose cents at this magnitude.
      value: amount === '' ? null : Number(amount).toFixed(2),
      currency: form.currency.trim().toUpperCase() || 'USD',
      win_probability: probability === '' ? null : Number(probability),
      expected_close_date: form.expected_close_date || null,
    })
  }

  const accountRows = accountOptions.data?.items ?? []

  return (
    <Drawer
      open
      onClose={onClose}
      title="New deal"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={busy}
            disabled={accountRows.length === 0}
          >
            Create deal
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

        {/* A deal cannot exist without an account, so with none there is
            nothing to fix on this form -- the next step is phase 1's page. */}
        {accountOptions.isSuccess && accountRows.length === 0 && (
          <div className="ui-callout ui-callout--warn">
            There are no accounts yet, and a deal requires one.{' '}
            <Link to="/accounts">Create an account first.</Link>
          </div>
        )}

        <div className="ui-form-grid">
          <div className="ui-span-2">
            <SelectField
              label="Account"
              value={form.account_id}
              disabled={accountOptions.isPending || accountRows.length === 0}
              error={fieldError('account_id')}
              onChange={(event) => set('account_id', event.target.value)}
            >
              <option value="">
                {accountOptions.isPending ? 'Loading accounts...' : 'Select an account'}
              </option>
              {accountRows.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="ui-span-2">
            <TextField
              label="Deal name"
              value={form.name}
              maxLength={255}
              placeholder="SecureFlow rollout"
              error={fieldError('name')}
              onChange={(event) => set('name', event.target.value)}
            />
          </div>

          <SelectField
            label="Stage"
            value={form.stage}
            hint="Required, and there is no default -- the opening stage is written to the deal's history."
            error={fieldError('stage')}
            onChange={(event) => set('stage', event.target.value as DealStage)}
          >
            {DEAL_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {humanise(stage)}
              </option>
            ))}
          </SelectField>

          <TextField
            label="Expected close"
            optional
            type="date"
            value={form.expected_close_date}
            error={fieldError('expected_close_date')}
            onChange={(event) => set('expected_close_date', event.target.value)}
          />

          <TextField
            label="Value"
            optional
            type="number"
            min={0}
            step="0.01"
            value={form.value}
            placeholder="180000"
            error={fieldError('value')}
            onChange={(event) => set('value', event.target.value)}
          />

          <TextField
            label="Currency"
            value={form.currency}
            maxLength={3}
            hint="Three-letter ISO code."
            error={fieldError('currency')}
            onChange={(event) => set('currency', event.target.value.toUpperCase())}
          />

          <TextField
            label="Win probability"
            optional
            type="number"
            min={0}
            max={100}
            value={form.win_probability}
            hint="0-100."
            error={fieldError('win_probability')}
            onChange={(event) => set('win_probability', event.target.value)}
          />
        </div>
      </form>
    </Drawer>
  )
}
