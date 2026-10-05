/**
 * Wire types, hand-written.
 *
 * Not generated, and that is a decision rather than a gap: this backend binds
 * its filter models with `Annotated[Filters, Query()]`, so OpenAPI describes
 * fourteen query parameters as a single `$ref` and a generated client
 * serialises them wrongly (`docs/frontend/PLAN.md`, conventions #4, and the
 * `list_deals` docstring says the same). Until the schema is fixed, generated
 * types would be a liability pointed at the exact endpoints that matter most.
 *
 * `Decimal` fields arrive as JSON strings, not numbers -- `deals.value` is
 * `Numeric(14, 2)`, and asyncpg plus Pydantic serialise it as `"180000.00"`.
 * Typed as `string` here so nobody multiplies one.
 */

// --------------------------------------------------------------- Envelopes

/**
 * The paginated envelope, used by `/accounts`, `/deals` and `/tasks` and by
 * nothing else. Every deal sub-resource returns a bare array instead
 * (conventions #1), so there are two client patterns and no third.
 */
export interface Page<T> {
  items: T[]
  /** Counted *before* the window, so page numbers need one request. */
  total: number
  limit: number
  offset: number
}

// --------------------------------------------------------------- Enums
//
// Mirrors `app/models/enums.py`. Written as const arrays rather than TS enums
// so the same value can both type a field and populate a `<select>`.

export const DEAL_STAGES = [
  'qualification',
  'discovery',
  'evaluation',
  'security_and_legal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const
export type DealStage = (typeof DEAL_STAGES)[number]

/** The two stages the backend treats as closed (`queries.CLOSED_STAGES`). */
export const CLOSED_STAGES: DealStage[] = ['closed_won', 'closed_lost']

export const RISK_LEVELS = ['low', 'medium', 'high'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

/** `GET /deals/{id}/analysis` -> `state`. Derived server-side, never stored. */
export type AnalysisState = 'clean' | 'debouncing' | 'due' | 'stale'

// --------------------------------------------------------------- Accounts

export interface AccountRef {
  id: string
  name: string
  industry: string | null
}

export interface Account extends AccountRef {
  website: string | null
  employee_band: string | null
  hq_region: string | null
}

export interface AccountListItem extends Account {
  deal_count: number
  contact_count: number
}

export interface AccountWrite {
  name: string
  industry?: string | null
  website?: string | null
  employee_band?: string | null
  hq_region?: string | null
}

export interface Contact {
  id: string
  account_id: string
  first_name: string
  last_name: string
  /** Optional by design: the transcript path mints contacts from a name. */
  email: string | null
  title: string | null
  phone: string | null
}

export interface ContactWrite {
  first_name: string
  last_name: string
  email?: string | null
  title?: string | null
  phone?: string | null
}

// ------------------------------------------------------------------ Deals

export interface DealListItem {
  id: string
  name: string
  account_id: string
  account_name: string
  /** JSON string, not a number. See the note at the top of this file. */
  value: string | null
  currency: string
  stage: DealStage
  win_probability: number | null
  risk_level: RiskLevel | null
  expected_close_date: string | null
  last_activity_at: string | null
  /** From the newest stage-history row: "is the deal moving". */
  days_in_stage: number
  /** Derived from the oldest open task; `deals` stores no next_action. */
  next_action: string | null
  next_action_due_date: string | null
}

export interface DealCounts {
  open_risks: number
  open_tasks: number
  open_commitments: number
  stakeholders: number
  meetings: number
  documents: number
}

export interface DealDetail {
  id: string
  name: string
  account: AccountRef
  value: string | null
  currency: string
  stage: DealStage
  win_probability: number | null
  risk_level: RiskLevel | null
  expected_close_date: string | null
  closed_at: string | null
  last_activity_at: string | null
  days_in_stage: number
  next_action: string | null
  next_action_due_date: string | null
  counts: DealCounts
  created_at: string
  updated_at: string
}

export interface DealCreate {
  account_id: string
  name: string
  /** Required: there is no defensible default for a deal's opening stage. */
  stage: DealStage
  value?: string | null
  currency?: string
  win_probability?: number | null
  expected_close_date?: string | null
}

export interface DealUpdate {
  name?: string
  value?: string | null
  currency?: string
  stage?: DealStage
  win_probability?: number | null
  expected_close_date?: string | null
  /**
   * Only meaningful alongside `stage` -- sending it without one is a 422 from
   * `DealUpdate._stage_note_needs_a_stage`. Writing `stage` is not a column
   * update; it also appends to `deal_stage_history`, and that row wants a note.
   */
  stage_note?: string
}

/**
 * The `/deals` query string.
 *
 * `extra="forbid"` means a misspelled key here is a 422 naming the field, not
 * a silently unfiltered list -- which is why this type is exact rather than
 * an index signature (plan 2.2).
 */
export interface DealFilters {
  limit?: number
  offset?: number
  account_id?: string
  contact_id?: string
  /** Repeatable. */
  stage?: DealStage[]
  risk_level?: RiskLevel[]
  /** Shorthand for "not in the closed stages". */
  open?: boolean
  /** Matches deal *or* account name. */
  q?: string
  value_min?: string
  value_max?: string
  close_before?: string
  close_after?: string
  /** No activity in N days -- "has anyone talked to them". */
  stale_days?: number
  /** No *stage* change in N days. A different question from `stale_days`. */
  stalled_days?: number
  /** Stuck by the backend's per-stage thresholds, not one flat number. */
  stalled?: boolean
  sort?: DealSort
}

export const DEAL_SORT_KEYS = [
  'name',
  'value',
  'stage',
  'risk',
  'days_in_stage',
  'expected_close_date',
  'last_activity_at',
  'created_at',
] as const
export type DealSortKey = (typeof DEAL_SORT_KEYS)[number]
/** A leading `-` is descending. Anything else is a 422 listing the keys. */
export type DealSort = DealSortKey | `-${DealSortKey}`

export interface StageHistoryEntry {
  id: string
  from_stage: DealStage | null
  to_stage: DealStage
  changed_at: string
  note: string | null
  /**
   * Whole days spent in `to_stage`. The newest entry is open-ended and is
   * measured against `now()`, so this is "still here, 58 days" rather than
   * null.
   */
  days_in_stage: number
}

// --------------------------------------------------------------- Analysis

export interface DealAnalysisStateResponse {
  deal_id: string
  state: AnalysisState
  dirty_first_at: string | null
  dirty_last_at: string | null
  dirty_reason: string | null
  swept_at: string | null
  /** Echoed so the UI can say "runs in ~40s" without hardcoding it. */
  debounce_seconds: number
  max_debounce_seconds: number
  sweep_hours: number
}

/** What `POST /deals/{id}/analysis` reports. It runs; it does not queue. */
export interface DetectionResult {
  risks_detected: number
  recommendations_written: number
  risks_auto_resolved: number
}

// ----------------------------------------------------------------- System

export interface AIStatus {
  config: {
    enabled: boolean
    model_primary: string
    model_cheap: string
    tokens_per_minute: number
    requests_per_minute: number
    max_concurrency: number
    debounce_seconds: number
    max_debounce_seconds: number
    sweep_hours: number
    tier2_suppressed: boolean
  }
  /** This process's leaky bucket -- the API's, not the worker's. */
  budget: {
    process: string
    tokens_available: number
    tokens_capacity: number
    seconds_to_full: number
  }
  /** Postgres rows, and therefore the trustworthy half of this payload. */
  queues: {
    queued_meetings: number
    oldest_queued_meeting_at: string | null
    dirty_deals: number
    oldest_dirty_at: string | null
    sweep_backlog: number
  }
}

// -------------------------------------------------------------- Documents

/**
 * The five source types. `source_type` is a **required** form field on upload
 * -- omitting it is a 422 that reads like a bug (plan 4.1).
 */
export const DOCUMENT_SOURCE_TYPES = [
  'meeting_transcript',
  'email',
  'proposal',
  'contract',
  'note',
] as const
export type DocumentSourceType = (typeof DOCUMENT_SOURCE_TYPES)[number]

/** Extensions the backend can extract text from today (`services/ingest.py`). */
export const SUPPORTED_UPLOAD_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.vtt',
  '.srt',
  '.pdf',
  '.docx',
] as const

/** `settings.max_upload_bytes`. Upload is synchronous, hence a limit at all. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export interface DocumentListItem {
  id: string
  title: string
  source_type: DocumentSourceType
  original_filename: string | null
  mime_type: string | null
  byte_size: number | null
  /**
   * When the conversation happened, **not** when the file was uploaded. A June
   * transcript uploaded today is still June, and recency ranking uses this.
   */
  occurred_at: string
  uploaded_at: string
  /**
   * A document with zero chunks can carry no citation, which is why the count
   * is on the row rather than hidden (plan 4.3).
   */
  chunk_count: number
}

export interface DocumentDetail extends DocumentListItem {
  deal_id: string | null
  account_id: string | null
  /** sha256 of the bytes -- the idempotency key behind the 200-on-duplicate. */
  content_hash: string
  created_at: string
  updated_at: string
}

/** Query string for `GET /deals/{id}/documents`. Unpaginated. */
export interface DocumentFilters {
  source_type?: DocumentSourceType[]
  q?: string
  occurred_before?: string
  occurred_after?: string
  sort?: DocumentSort
}

export const DOCUMENT_SORT_KEYS = ['occurred_at', 'uploaded_at', 'title'] as const
export type DocumentSortKey = (typeof DOCUMENT_SORT_KEYS)[number]
export type DocumentSort = DocumentSortKey | `-${DocumentSortKey}`

/**
 * One retrievable span, fetched by id to render a citation.
 *
 * `metadata` is the serialised name -- the Pydantic field is `chunk_metadata`
 * with `alias="metadata"`, and the alias is what goes on the wire (verified
 * against the running API).
 *
 * Its `char_start` / `char_end` are offsets into the **whole document**, which
 * are *not* the ones an `EvidenceItem` carries. See the note there.
 */
export interface ChunkDetail {
  id: string
  document_id: string
  document_title: string
  source_type: DocumentSourceType
  occurred_at: string
  chunk_index: number
  content: string
  token_count: number | null
  metadata: {
    speaker?: string | null
    speakers?: string[]
    page?: number | null
    char_start?: number
    char_end?: number
  } | null
}

// --------------------------------------------------------------- Evidence

/**
 * What a piece of evidence points at.
 *
 * `record` is not an afterthought: most risk detection reasons over
 * structured state ("stage has not moved in 58 days") rather than over
 * quotes, so a drawer that only rendered document spans would leave every
 * deterministic risk looking uncited.
 */
export const SOURCE_KINDS = ['document', 'record', 'derived'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

/**
 * Gate 0's outcome for one claim -> evidence link, plus Gate 2's staleness.
 *
 * There is deliberately no `rejected` here. Task 5.5 asks for `stale` and
 * `rejected` to be distinguishable, and they are -- but they live on
 * different axes: this enum is the machine's check of whether the *source
 * still says what was recorded*, while `rejected` is a `facts.status`, a
 * human decision in Gate 3 (phase 9). The states that mean "the source no
 * longer supports this" are `span_missing` and `value_drifted`, and those are
 * what must never share a colour with `stale`.
 */
export const VERIFICATION_STATUSES = [
  'unverified',
  'verified',
  'span_missing',
  'value_drifted',
  'stale',
] as const
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]

/** Points at a field in our own database, for `record`-kind evidence. */
export interface RecordRef {
  table?: string
  id?: string
  field?: string
}

export interface EvidenceItem {
  id: string
  source_kind: SourceKind
  /**
   * The literal value or quote. This is what lets Gate 0 re-check that the
   * source still says it, and what makes a risk self-invalidate when the
   * underlying field changes.
   */
  snippet: string | null
  document_id: string | null
  chunk_id: string | null
  record_ref: RecordRef | null
  /**
   * Offsets into the **chunk's** `content`, not the document's.
   *
   * Verified against the running API: for a span at 103-152,
   * `chunk.content.slice(103, 152)` is exactly `snippet`. The document-level
   * offsets are the separate pair inside `ChunkDetail.metadata`, and mixing
   * the two would highlight the wrong stretch of text.
   */
  char_start: number | null
  char_end: number | null
  speaker: string | null
  occurred_at: string | null
  /** Decimal as a string. How strongly *this* span supports *this* claim. */
  relevance: string | null
  verification_status: VerificationStatus | null
  verified_at: string | null
}

/** The five claim tables `claim_evidence` is polymorphic over. */
export type ClaimType = 'fact' | 'commitment' | 'risk' | 'recommendation' | 'chat_message'

// ------------------------------------------------------------------- Risks
//
// Phase 6 owns this screen. The subset here is what phase 5 needs to give the
// evidence drawer a call site: enough to list risks read-only and open their
// citations. The decision controls -- accept, dismiss, status change -- are
// phase 6 and are deliberately absent.

export const RISK_STATUSES = ['open', 'mitigating', 'resolved', 'dismissed'] as const
export type RiskStatus = (typeof RISK_STATUSES)[number]

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type Severity = (typeof SEVERITIES)[number]

/** Who authored a row. Without it, "how much of this did the model write?". */
export type Origin = 'user' | 'ai'

export interface RecommendationSummary {
  id: string
  title: string
  action_type: string
  priority: string
  rationale: string | null
  status: string
  /** Derived from the task's status, never a stored copy of it. */
  is_completed: boolean
  created_task_id: string | null
  dismissal_reason: string | null
}

export interface RiskListItem {
  id: string
  /** Free text when the detector names its own; see `risk_key` in phase 6. */
  risk_type: string
  title: string
  description: string | null
  severity: Severity
  status: RiskStatus
  origin: Origin
  /**
   * The generator's **self-reported** guess, as a decimal string.
   *
   * Never render this as a validation verdict (plan 5.6). Verdicts live in
   * `claim_validations`, which is not exposed over HTTP at all -- so there is
   * no verdict available to confuse this with, which makes the mistake easier
   * to make rather than harder.
   */
  confidence: string | null
  first_detected_at: string
  last_seen_at: string
  resolved_at: string | null
  /** How many citations back this risk. 0 means it asserts something uncited. */
  evidence_count: number
  recommendation: RecommendationSummary | null
}

export interface RiskFilters {
  status?: RiskStatus[]
  risk_type?: string[]
  severity?: Severity[]
  /** `open` collapses `open` + `mitigating`, which is what the panel means. */
  open?: boolean
}
