import { DEAL_STAGES, RISK_LEVELS } from '../../lib/types'
import type { DealFilters, DealSort } from '../../lib/types'
import { humanise } from '../../lib/format'
import { Button, SelectField, TextField } from '../../components/ui'

export interface DealFilterBarProps {
  /** The live filter state, minus `limit`/`offset`, which the pager owns. */
  value: DealFilters
  onChange: (next: DealFilters) => void
  /** Bound separately so typing stays responsive while `q` is debounced. */
  search: string
  onSearchChange: (next: string) => void
}

/**
 * How "open" is sent.
 *
 * `open` is the backend's own shorthand for "not in the closed stages", and
 * it exists so a client need not enumerate them -- nor remember to revisit
 * that list when an eighth stage is added. So the filter sends `open` rather
 * than a `stage` array, deliberately.
 */
const OPEN_OPTIONS = [
  { value: 'open', label: 'Open pipeline' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All deals' },
] as const

const SORT_OPTIONS: { value: DealSort; label: string }[] = [
  { value: '-last_activity_at', label: 'Last activity (newest)' },
  { value: 'last_activity_at', label: 'Last activity (oldest)' },
  { value: '-value', label: 'Value (highest)' },
  { value: 'value', label: 'Value (lowest)' },
  { value: 'expected_close_date', label: 'Close date (soonest)' },
  { value: '-days_in_stage', label: 'Days in stage (longest)' },
  { value: '-risk', label: 'Risk (highest)' },
  { value: 'name', label: 'Name (A-Z)' },
]

/**
 * The filter bar, bound to `DealFilters` (task 2.2).
 *
 * Every control here maps to one declared field on that model. That matters
 * more than it looks: `extra="forbid"` means a key the model does not declare
 * is a 422 naming the field, never a silently unfiltered list -- so this
 * component is the place where a typo would become one, and the typed
 * `DealFilters` is what turns it into a compile error instead.
 *
 * `stalled` and `stale_days` are both offered because they answer different
 * questions, and the plan is explicit that they are not interchangeable:
 * `stale_days` is "has anyone talked to them", `stalled` is "is the deal
 * moving", judged against the backend's per-stage thresholds rather than one
 * flat number. A deal with weekly check-ins and no stage movement for two
 * months is invisible to the first and is exactly what the second finds.
 */
export function DealFilterBar({ value, onChange, search, onSearchChange }: DealFilterBarProps) {
  const openness = value.open === true ? 'open' : value.open === false ? 'closed' : 'all'

  const patch = (next: Partial<DealFilters>) => onChange({ ...value, ...next })

  const active =
    Boolean(search) ||
    value.open !== undefined ||
    Boolean(value.stage?.length) ||
    Boolean(value.risk_level?.length) ||
    value.stalled !== undefined ||
    value.stale_days !== undefined

  return (
    <div className="filter-bar">
      <div className="ui-form-grid filter-bar__grid">
        <TextField
          label="Search"
          type="search"
          value={search}
          placeholder="Deal or account name"
          hint="Matches the deal name or the account name."
          onChange={(event) => onSearchChange(event.target.value)}
        />

        <SelectField
          label="Status"
          value={openness}
          onChange={(event) => {
            const next = event.target.value
            patch({ open: next === 'all' ? undefined : next === 'open' })
          }}
        >
          {OPEN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Stage"
          // Single-select over a repeatable parameter: the server takes a
          // list, and this sends a one-element one. A multi-select is a
          // reasonable upgrade and needs no transport change.
          value={value.stage?.[0] ?? ''}
          onChange={(event) => {
            const stage = event.target.value
            patch({ stage: stage ? [stage as (typeof DEAL_STAGES)[number]] : [] })
          }}
        >
          <option value="">Any stage</option>
          {DEAL_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {humanise(stage)}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Risk level"
          value={value.risk_level?.[0] ?? ''}
          hint="The rollup the analyzer maintains, not a per-risk severity."
          onChange={(event) => {
            const level = event.target.value
            patch({ risk_level: level ? [level as (typeof RISK_LEVELS)[number]] : [] })
          }}
        >
          <option value="">Any risk level</option>
          {RISK_LEVELS.map((level) => (
            <option key={level} value={level}>
              {humanise(level)}
            </option>
          ))}
        </SelectField>

        <SelectField
          label="Movement"
          value={value.stalled === true ? 'stalled' : value.stalled === false ? 'moving' : 'any'}
          hint="Stalled uses the per-stage thresholds: 40 days in security review is normal, in discovery it is not."
          onChange={(event) => {
            const next = event.target.value
            patch({ stalled: next === 'any' ? undefined : next === 'stalled' })
          }}
        >
          <option value="any">Any</option>
          <option value="stalled">Stalled</option>
          <option value="moving">Moving</option>
        </SelectField>

        <SelectField
          label="Last activity"
          value={value.stale_days === undefined ? '' : String(value.stale_days)}
          hint="No contact at all in this window. A different question from Movement."
          onChange={(event) => {
            const days = event.target.value
            patch({ stale_days: days === '' ? undefined : Number(days) })
          }}
        >
          <option value="">Any time</option>
          <option value="7">Silent 7+ days</option>
          <option value="14">Silent 14+ days</option>
          <option value="30">Silent 30+ days</option>
          <option value="90">Silent 90+ days</option>
        </SelectField>

        <SelectField
          label="Sort"
          value={value.sort ?? '-last_activity_at'}
          onChange={(event) => patch({ sort: event.target.value as DealSort })}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>

      {active && (
        <div className="filter-bar__reset">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onSearchChange('')
              onChange({ sort: value.sort })
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}
