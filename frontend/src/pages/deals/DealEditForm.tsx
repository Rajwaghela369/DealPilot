import { useState } from 'react'
import { ApiError } from '../../lib/api'
import { clearKey } from '../../lib/formState'
import { DEAL_STAGES } from '../../lib/types'
import type { DealDetail, DealStage, DealUpdate } from '../../lib/types'
import { humanise } from '../../lib/format'
import { Button, Drawer, SelectField, TextAreaField, TextField } from '../../components/ui'

export interface DealEditFormProps {
  deal: DealDetail
  busy?: boolean
  error?: unknown
  onSubmit: (body: DealUpdate) => void
  onClose: () => void
}

interface FormState {
  name: string
  stage: DealStage
  value: string
  currency: string
  win_probability: string
  expected_close_date: string
  stage_note: string
}

/**
 * Task 3.3: edit the deal's fields.
 *
 * Three things the `DealUpdate` contract forces, each of which would be a bug
 * if ignored:
 *
 * 1. **Only changed keys are sent.** The server reads
 *    `model_dump(exclude_unset=True)`, so a key being *present* is the write
 *    -- which is also how `null` clears a nullable column and an omitted key
 *    leaves it alone. Posting the whole form would make every save overwrite
 *    fields this form merely displayed.
 * 2. **`stage_note` cannot travel alone.** `_stage_note_needs_a_stage`
 *    rejects it without a `stage`, so the note input only appears once the
 *    stage has actually been changed. Writing `stage` is not a column update
 *    -- it appends to `deal_stage_history` and sets or clears `closed_at` --
 *    and the history row is what wants the note.
 * 3. **`account_id` is absent, and not by oversight.** Re-parenting a deal
 *    would strand every `deal_contacts` row on it, because contacts belong to
 *    accounts. It is immutable after create, so there is no control for it.
 *
 * Mounted only while open, so the initial values come from `useState` and
 * there is no reset effect -- which also removes the null-state the effect
 * version needed before its first run.
 */
export function DealEditForm({ deal, busy, error, onSubmit, onClose }: DealEditFormProps) {
  const [form, setForm] = useState<FormState>(() => ({
    name: deal.name,
    stage: deal.stage,
    value: deal.value ?? '',
    currency: deal.currency,
    win_probability: deal.win_probability === null ? '' : String(deal.win_probability),
    expected_close_date: deal.expected_close_date ?? '',
    // Always blank: the note describes the transition being made now, not
    // whatever was written on the last one.
    stage_note: '',
  }))
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setLocalErrors((current) => clearKey(current, key))
  }

  const fieldError = (path: string) =>
    localErrors[path] ?? (error instanceof ApiError ? error.fieldError(path) : undefined)

  const stageChanged = form.stage !== deal.stage

  const handleSubmit = () => {
    const problems: Record<string, string> = {}
    const name = form.name.trim()
    if (!name) problems.name = 'A name is required -- clearing it is a 422.'

    const probability = form.win_probability.trim()
    if (probability !== '') {
      const parsed = Number(probability)
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
        problems.win_probability = 'A whole number between 0 and 100.'
      }
    }

    const amount = form.value.trim()
    if (amount !== '' && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) {
      problems.value = 'A positive amount, or leave it empty to clear it.'
    }

    if (Object.keys(problems).length) {
      setLocalErrors(problems)
      return
    }

    const body: DealUpdate = {}

    if (name !== deal.name) body.name = name

    const nextValue = amount === '' ? null : Number(amount).toFixed(2)
    if (nextValue !== (deal.value ?? null)) body.value = nextValue

    const currency = form.currency.trim().toUpperCase()
    if (currency && currency !== deal.currency) body.currency = currency

    const nextProbability = probability === '' ? null : Number(probability)
    if (nextProbability !== deal.win_probability) body.win_probability = nextProbability

    const nextClose = form.expected_close_date || null
    if (nextClose !== (deal.expected_close_date ?? null)) {
      body.expected_close_date = nextClose
    }

    if (stageChanged) {
      body.stage = form.stage
      // Only alongside a stage, and only when the user wrote one -- an empty
      // string would store a blank note on the history row.
      const note = form.stage_note.trim()
      if (note) body.stage_note = note
    }

    if (Object.keys(body).length === 0) {
      onClose()
      return
    }
    onSubmit(body)
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="Edit deal"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={busy}>
            Save changes
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
              label="Deal name"
              value={form.name}
              maxLength={255}
              error={fieldError('name')}
              onChange={(event) => set('name', event.target.value)}
            />
          </div>

          <SelectField
            label="Stage"
            value={form.stage}
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
            hint="Clearing this clears it on the deal."
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
            error={fieldError('value')}
            onChange={(event) => set('value', event.target.value)}
          />

          <TextField
            label="Currency"
            value={form.currency}
            maxLength={3}
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
            hint="0-100. Empty means nobody has estimated it."
            error={fieldError('win_probability')}
            onChange={(event) => set('win_probability', event.target.value)}
          />

          {/* Appears only once the stage has changed: the server refuses a
              note without one, and an always-visible box would invite typing
              into a field that cannot be sent. */}
          {stageChanged && (
            <div className="ui-span-2">
              <TextAreaField
                label="Why the stage changed"
                optional
                value={form.stage_note}
                placeholder="Security review signed off"
                hint="Recorded on the stage-history row, not on the deal. This transition is permanent -- history is append-only."
                error={fieldError('stage_note')}
                onChange={(event) => set('stage_note', event.target.value)}
              />
            </div>
          )}

          {stageChanged &&
            (form.stage === 'closed_won' || form.stage === 'closed_lost') && (
              <div className="ui-span-2">
                <div className="ui-callout ui-callout--warn">
                  Moving to <strong>{humanise(form.stage)}</strong> also sets the deal's
                  close date. Reopening it later leaves both transitions in the history.
                </div>
              </div>
            )}
        </div>
      </form>
    </Drawer>
  )
}
