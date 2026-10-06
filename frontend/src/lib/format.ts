/**
 * Display formatting. One module, so "no close date" reads the same on every
 * screen.
 *
 * The em dash is the house placeholder for "this column is empty", and it is
 * deliberately not the string "None" or "null" or "0": most nullable columns
 * here are nullable because the information genuinely is not known yet, and a
 * zero would assert something.
 */

import type { BadgeTone } from '../components/ui/Badge'
import type {
  AnalysisState,
  DealStage,
  MeetingAnalysisStatus,
  MeetingStatus,
  RiskLevel,
  Sentiment,
} from './types'

export const EMPTY = '—'

/**
 * Money.
 *
 * `value` arrives as a JSON string because `deals.value` is `Numeric(14, 2)`,
 * so it is parsed here and nowhere else. Rendered with no decimal places --
 * these are six-figure deal values and the cents are noise -- but parsed as a
 * float rather than truncated as text, so `"180000.50"` rounds rather than
 * reading as `180000`.
 */
export function formatMoney(value: string | null, currency = 'USD'): string {
  if (value === null || value === '') return EMPTY
  const amount = Number(value)
  if (!Number.isFinite(amount)) return EMPTY
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    // An unknown ISO code throws rather than falling back. The number is
    // still worth showing, so show it with the code beside it.
    return `${currency} ${Math.round(amount).toLocaleString()}`
  }
}

/**
 * A plain date (`expected_close_date` and friends are `date`, not `datetime`).
 *
 * Split on `-` rather than passed to `new Date()`: `new Date('2026-10-15')`
 * parses as midnight **UTC** and then renders in local time, so west of
 * Greenwich every close date displays a day early. There is no time here to
 * get wrong, so there is no timezone to apply.
 */
export function formatDate(value: string | null): string {
  if (!value) return EMPTY
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return EMPTY
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * A timestamp. These *are* timezone-aware with `Z` (conventions #7), so the
 * usual parse is correct.
 */
export function formatDateTime(value: string | null): string {
  if (!value) return EMPTY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return EMPTY
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * "3 days ago", for `last_activity_at`.
 *
 * Null is "never", not "today". A deal nobody has touched is the headline on
 * the pipeline table, and rendering it as a recent date would hide exactly the
 * row the user is looking for.
 */
export function formatRelative(value: string | null): string {
  if (!value) return 'never'
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return EMPTY

  const seconds = Math.round((Date.now() - then) / 1000)
  const future = seconds < 0
  const abs = Math.abs(seconds)

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
    ['year', Number.POSITIVE_INFINITY],
  ]

  let amount = abs
  for (const [unit, size] of units) {
    if (amount < size) {
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
      return rtf.format(future ? Math.round(amount) : -Math.round(amount), unit)
    }
    amount /= size
  }
  return EMPTY
}

/**
 * File size.
 *
 * Binary units, because the server's limit is binary: `max_upload_bytes` is
 * `25 * 1024 * 1024`, so a file the UI called "25 MB" on a decimal scale
 * would be refused while appearing to be exactly at the limit.
 */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return EMPTY
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** `security_and_legal` -> `Security and legal`. */
export function humanise(value: string | null | undefined): string {
  if (!value) return EMPTY
  const words = value.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// ------------------------------------------------------- Status vocabulary

/**
 * Stage -> badge tone.
 *
 * Only the two terminal stages get a valence, and they get opposite ones.
 * Everything in flight is `accent`: a deal in `discovery` is not "worse" than
 * one in `negotiation`, it is earlier, and colouring the pipeline as a
 * gradient from bad to good would assert a judgement the data does not carry.
 */
export function stageTone(stage: DealStage): BadgeTone {
  if (stage === 'closed_won') return 'ok'
  if (stage === 'closed_lost') return 'danger'
  return 'accent'
}

/**
 * Risk level -> badge tone.
 *
 * `low` is neutral rather than green: a deal with low *detected* risk has not
 * been validated as healthy, only as not yet flagged, and green would read as
 * the former. Phase 5.6 is the same principle applied to `confidence`.
 */
export function riskTone(level: RiskLevel | null): BadgeTone {
  switch (level) {
    case 'high':
      return 'danger'
    case 'medium':
      return 'warn'
    case 'low':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/**
 * The four analysis states, as the badge and the sentence beside it.
 *
 * `debouncing` and `due` are kept apart because they mean opposite things to
 * someone watching the screen: one says "still collecting your edits", the
 * other says "running shortly". The backend's own docstring makes the point --
 * collapsing them into "queued" would make the quiet window look like
 * latency.
 */
export function analysisLabel(state: AnalysisState): { tone: BadgeTone; label: string } {
  switch (state) {
    case 'clean':
      return { tone: 'ok', label: 'Up to date' }
    case 'debouncing':
      return { tone: 'info', label: 'Collecting edits' }
    case 'due':
      return { tone: 'warn', label: 'Queued' }
    case 'stale':
      return { tone: 'neutral', label: 'Awaiting sweep' }
    default:
      return { tone: 'neutral', label: humanise(state) }
  }
}

/** The explanation under the badge. Each one says what happens next. */
export function analysisExplanation(
  state: AnalysisState,
  debounceSeconds: number,
  sweepHours: number,
): string {
  switch (state) {
    case 'clean':
      return 'Nothing is pending and this deal was swept inside the current window.'
    case 'debouncing':
      return `Edits are still arriving. The worker waits ${debounceSeconds}s of quiet before running, so further changes collapse into one pass.`
    case 'due':
      return 'Past the quiet window. The worker claims this deal on its next poll.'
    case 'stale':
      return `Not marked dirty, but it has not been swept in ${sweepHours}h, so the sweep will pick it up.`
    default:
      return ''
  }
}

/**
 * Meeting analysis status -> badge, with the sentence that says what to do.
 *
 * `failed` is the state this exists for. A run that fails a critical stage is
 * recorded `failed` and **never retried**, so without a visible terminal
 * state a stuck meeting is indistinguishable from a slow one (plan 7.4). It
 * is red, and the only one that tells the user to act.
 *
 * `not_started` is neutral, not a warning: most meetings have no transcript
 * and nothing to analyse, so flagging them would make the normal case look
 * broken.
 */
export function meetingAnalysisLabel(status: MeetingAnalysisStatus): {
  tone: BadgeTone
  label: string
  explanation: string
} {
  switch (status) {
    case 'complete':
      return {
        tone: 'ok',
        label: 'Analysed',
        explanation: 'The pipeline finished. Check for a partial failure below.',
      }
    case 'queued':
      return {
        tone: 'info',
        label: 'Queued',
        explanation:
          'Accepted, not done. The worker claims it on its next poll -- if this never changes, the worker is not running.',
      }
    case 'running':
      return { tone: 'info', label: 'Running', explanation: 'Analysis is in progress.' }
    case 'failed':
      return {
        tone: 'danger',
        label: 'Failed',
        explanation:
          'A critical stage failed and this is not retried automatically. It will stay here until someone re-runs it.',
      }
    case 'not_started':
    default:
      return {
        tone: 'neutral',
        label: 'Not analysed',
        explanation: 'Nothing has been queued. A transcript is what makes a meeting analysable.',
      }
  }
}

/** Meeting status -> tone. Only `cancelled` carries a negative valence. */
export function meetingStatusTone(status: MeetingStatus): BadgeTone {
  if (status === 'completed') return 'ok'
  if (status === 'cancelled') return 'danger'
  return 'accent'
}

/**
 * Sentiment -> tone.
 *
 * `unknown` and null are both neutral and read as "not determined". The
 * analyzer reports sentiment it inferred, so a missing value means it did not
 * run or could not tell -- never "neutral sentiment", which is a finding.
 */
export function sentimentTone(sentiment: Sentiment | null): BadgeTone {
  switch (sentiment) {
    case 'positive':
      return 'ok'
    case 'negative':
      return 'danger'
    case 'neutral':
      return 'info'
    default:
      return 'neutral'
  }
}
