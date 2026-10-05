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

export const RISK_STATUSES = ['open', 'mitigating', 'resolved', 'dismissed'] as const
export type RiskStatus = (typeof RISK_STATUSES)[number]

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type Severity = (typeof SEVERITIES)[number]

/** Who authored a row. Without it, "how much of this did the model write?". */
export type Origin = 'user' | 'ai'

/**
 * How response enums are typed here, and why it is not uniform.
 *
 * `app/models/enums.py` picks storage per set, and the choice says which
 * vocabularies are expected to move: a **native Postgres enum** for sets that
 * will not churn (`severity`, `priority`, `risk_status`,
 * `recommendation_status`), and **text + CHECK** for the ones that will as
 * prompts are tuned (`risk_type`, `action_type`, `dismissal_reason`) --
 * because adding a value there is a one-line CHECK swap rather than an
 * ALTER TYPE.
 *
 * So the stable sets get closed unions, and the churning ones stay `string`
 * on responses. A new `action_type` shipped by the backend should render as an
 * unknown-but-harmless label, not break the build of a client that is
 * otherwise fine -- `humanise()` handles any slug. Request bodies use the
 * closed unions regardless, which mirrors the backend typing its own request
 * models with the enums so a bad value inbound is a 422.
 */
export interface RecommendationSummary {
  id: string
  title: string
  /** text + CHECK: may gain values. Compare with `isCorrectRecord`. */
  action_type: string
  priority: Priority
  rationale: string | null
  status: RecommendationStatus
  /** Derived from the task's status, never a stored copy of it. */
  is_completed: boolean
  created_task_id: string | null
  /** text + CHECK: may gain values. */
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

// ------------------------------------------- Recommendations (phase 6)

export const RECOMMENDATION_STATUSES = [
  'suggested',
  'accepted',
  'dismissed',
  'completed',
] as const
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number]

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]

/**
 * What a recommendation asks for.
 *
 * `correct_record` is the odd one out, and task 6.6 turns on it: every other
 * value names an action to take, while this one is a claim that a row in our
 * own database is wrong. The backend gave it its own value rather than filing
 * it under the nearest action precisely so the action-type distribution stays
 * meaningful -- so the UI must not render it as a to-do either.
 */
export const ACTION_TYPES = [
  'schedule_meeting',
  'send_document',
  'follow_up_email',
  'engage_stakeholder',
  'update_close_date',
  'address_objection',
  'internal_escalation',
  'correct_record',
] as const
export type ActionType = (typeof ACTION_TYPES)[number]

/** True for the one action type that is a claim rather than a task. */
export function isCorrectRecord(actionType: string): boolean {
  return actionType === 'correct_record'
}

/**
 * Why a human said no.
 *
 * **Five values, not the three the plan lists.** `bad_timing` and `other` are
 * real members of `DismissalReason` and both are accepted by the API
 * (verified live). Omitting them would push "revisit after the security
 * review" into `not_relevant`, which is the opposite of what it means -- and
 * these counts are a real input to the detector's suppression logic, not
 * telemetry, so a miscategorised dismissal actively misinforms it.
 */
export const DISMISSAL_REASONS = [
  'already_handled',
  'not_relevant',
  'wrong',
  'bad_timing',
  'other',
] as const
export type DismissalReason = (typeof DISMISSAL_REASONS)[number]

export interface RecommendationDetail {
  id: string
  deal_id: string
  /** Null for a *proactive* recommendation with no risk to nest under. */
  source_risk_id: string | null
  title: string
  description: string | null
  rationale: string | null
  /** text + CHECK: may gain values. Compare with `isCorrectRecord`. */
  action_type: string
  priority: Priority
  /** Self-reported. Not a verdict -- see the note on `RiskListItem`. */
  confidence: string | null
  status: RecommendationStatus
  origin: Origin
  /** Derived from the task's status, never a stored copy of it. */
  is_completed: boolean
  created_task_id: string | null
  /** text + CHECK: may gain values. */
  dismissal_reason: string | null
  dismissal_note: string | null
  generated_at: string
  decided_at: string | null
}

/**
 * The task this becomes, as the user edited the prefilled form.
 *
 * `due_date` is **required** even though `tasks.due_date` is nullable: the
 * point of accepting is to commit to *when*, and undated committed work is
 * how a task list becomes noise. Omitting it is a 422 naming the field
 * (verified live). `title`, `description` and `priority` default to the
 * recommendation's own values when omitted.
 */
export interface RecommendationAccept {
  title?: string
  description?: string | null
  due_date: string
  priority?: Priority
}

export interface RecommendationDismiss {
  reason: DismissalReason
  /** The detail a count cannot carry. */
  note?: string | null
}

/** Only the human decision is writable; the claim belongs to the detector. */
export interface RiskUpdate {
  status: RiskStatus
  /** Free text on the decision, not on the claim. */
  note?: string | null
}

export interface RecommendationFilters {
  status?: RecommendationStatus[]
  action_type?: ActionType[]
  /**
   * `true` lists only recommendations with no `source_risk_id` -- the
   * proactive ones, which the risk panel structurally cannot show because
   * they nest under nothing.
   */
  orphaned?: boolean
}

// ---------------------------------------------------------- Meetings (p7)

export const MEETING_TYPES = [
  'discovery',
  'demo',
  'technical_review',
  'security_review',
  'negotiation',
  'check_in',
  'other',
] as const
export type MeetingType = (typeof MEETING_TYPES)[number]

export const MEETING_STATUSES = ['scheduled', 'completed', 'cancelled'] as const
export type MeetingStatus = (typeof MEETING_STATUSES)[number]

/**
 * The analyzer's state machine.
 *
 * `failed` is the one that needs a visible home: a run that fails a critical
 * stage is recorded `failed` and **not retried**, so without somewhere to show
 * it a stuck meeting looks like a slow one forever (plan 7.4).
 */
export const ANALYSIS_STATUSES = [
  'not_started',
  'queued',
  'running',
  'complete',
  'failed',
] as const
export type MeetingAnalysisStatus = (typeof ANALYSIS_STATUSES)[number]

export const SENTIMENTS = ['positive', 'neutral', 'negative', 'unknown'] as const
export type Sentiment = (typeof SENTIMENTS)[number]

export interface MeetingListItem {
  id: string
  title: string
  /** Native enum, stable. */
  meeting_type: MeetingType
  status: MeetingStatus
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  sentiment: Sentiment | null
  analysis_status: MeetingAnalysisStatus
  analyzed_at: string | null
  /** Derived: whether a transcript document is attached. */
  has_transcript: boolean
  attendee_count: number
}

export interface MeetingDetail extends MeetingListItem {
  deal_id: string
  deal_name: string
  account_id: string
  account_name: string
  summary: string | null
  /** Set by the document-upload flow, never by a client PATCHing a FK. */
  transcript_document_id: string | null
  created_at: string
  updated_at: string
}

/** The narrow projection the analyzer screen polls. */
export interface MeetingAnalysis {
  meeting_id: string
  analysis_status: MeetingAnalysisStatus
  analyzed_at: string | null
  summary: string | null
  sentiment: Sentiment | null
  has_transcript: boolean
  /**
   * Which degradable stages failed, and why.
   *
   * Set on a **`complete`** run as well as a failed one -- a meeting whose
   * summary stage died still has its facts. So this must be rendered
   * independently of the status, or a partially-degraded run reads as clean.
   */
  analysis_error: string | null
}

export interface MeetingBrief {
  id: string
  meeting_id: string
  objectives: string[] | null
  context_summary: string | null
  key_risks: string[] | null
  recommended_questions: string[] | null
  /** Which model wrote it. */
  model: string | null
  generated_at: string
}

export interface MeetingWrite {
  title: string
  meeting_type?: MeetingType
  status?: MeetingStatus
  scheduled_at?: string | null
  started_at?: string | null
  ended_at?: string | null
  summary?: string | null
  sentiment?: Sentiment | null
}

export interface MeetingFilters {
  status?: MeetingStatus[]
  meeting_type?: MeetingType[]
  analysis_status?: MeetingAnalysisStatus[]
  /** Scheduled and still in the future -- the prep queue. */
  upcoming?: boolean
  has_transcript?: boolean
  q?: string
  sort?: string
}

/**
 * One person on one call.
 *
 * `raw_name` is the name as it appeared -- in the invite, or as a transcript
 * speaker label. `contact_id` is the optional *resolution* of that name to a
 * known person, and an unresolved attendee is the raw signal for "missing
 * stakeholder" rather than a data-entry failure.
 */
export interface MeetingAttendee {
  id: string
  raw_name: string
  contact_id: string | null
  contact_name: string | null
  contact_email: string | null
  contact_title: string | null
  is_internal: boolean
  /**
   * Only meaningful once the meeting is `completed`. On a scheduled meeting
   * this really means "invited", which the column cannot distinguish -- so the
   * UI must not label it "attended" before the meeting has happened.
   */
  attended: boolean
  resolved: boolean
}

export interface AttendeeWrite {
  raw_name: string
  contact_id?: string | null
  is_internal?: boolean
  attended?: boolean
}

/** A new person created from an attendee. No `account_id`: it is derived. */
export interface ContactIdentity {
  first_name: string
  last_name: string
  email?: string | null
  title?: string | null
  phone?: string | null
}

export interface StakeholderIdentity {
  buying_role?: string | null
  influence?: string | null
  sentiment?: string | null
  is_primary?: boolean
  notes?: string | null
}

/**
 * Turn "Dana (procurement)" into a tracked person, in one transaction.
 *
 * **Exactly one** of `contact_id` (link someone who exists) or `contact`
 * (create them first) -- sending both or neither is a 422. `stakeholder`
 * optionally adds the `deal_contacts` row in the same call, so it cannot
 * half-fail with a contact created and no stakeholder link.
 */
export interface AttendeeResolve {
  contact_id?: string
  contact?: ContactIdentity
  stakeholder?: StakeholderIdentity
  /** Re-point an attendee that is already resolved; otherwise that is a 409. */
  force?: boolean
}

export interface AttendeeFilters {
  resolved?: boolean
  is_internal?: boolean
  attended?: boolean
}

// ------------------------------------------------------------ People (p8)

export const BUYING_ROLES = [
  'champion',
  'economic_buyer',
  'technical',
  'blocker',
  'influencer',
  'unknown',
] as const
export type BuyingRole = (typeof BUYING_ROLES)[number]

export const INFLUENCE_LEVELS = ['low', 'medium', 'high', 'unknown'] as const
export type InfluenceLevel = (typeof INFLUENCE_LEVELS)[number]

/** A `deal_contacts` row joined to the person it points at. */
export interface DealStakeholder {
  contact_id: string
  first_name: string
  last_name: string
  email: string | null
  title: string | null
  phone: string | null
  /**
   * Native enums, so closed unions are safe.
   *
   * **No `origin` column exists on `deal_contacts`,** so once both a human and
   * the analyzer can write these there is no way to tell which did. The UI must
   * not label them as either (plan, phase 8 Pending backend).
   */
  buying_role: BuyingRole
  influence: InfluenceLevel
  sentiment: Sentiment
  is_primary: boolean
  notes: string | null
}

export interface StakeholderWrite {
  buying_role?: BuyingRole
  influence?: InfluenceLevel
  sentiment?: Sentiment
  is_primary?: boolean
  notes?: string | null
}

export interface StakeholderCreate extends StakeholderWrite {
  contact_id: string
}

/**
 * One person rolled up across every meeting on the deal.
 *
 * Not the same list as stakeholders, and the difference is the whole point:
 * `meetings_attended > 0` with `is_stakeholder: false` means somebody is
 * influencing this deal and nobody is tracking them; `is_stakeholder: true`
 * with `meetings_attended: 0` is a tracked person who has never turned up,
 * which for an economic buyer *is* the `no_economic_buyer` risk.
 */
export interface DealParticipant {
  contact_id: string | null
  name: string
  email: string | null
  title: string | null
  is_internal: boolean
  resolved: boolean
  is_stakeholder: boolean
  buying_role: string | null
  influence: string | null
  meetings_attended: number
  last_seen_at: string | null
}

export interface ParticipantFilters {
  is_stakeholder?: boolean
  resolved?: boolean
  /** Defaults to false server-side: your own people are not participants. */
  is_internal?: boolean
}

// ------------------------------------------------------------- Facts (p9)

export const FACT_TYPES = [
  'requirement',
  'objection',
  'stakeholder',
  'commitment',
  'deadline',
  'budget',
  'competitor',
  'decision_criteria',
] as const
export type FactType = (typeof FACT_TYPES)[number]

export const FACT_STATUSES = ['pending', 'accepted', 'rejected', 'superseded'] as const
export type FactStatus = (typeof FACT_STATUSES)[number]

/**
 * Gate 1's independent check: does the quoted span support the claim?
 *
 * This is a **verdict**, and it is the thing `confidence` must never be
 * rendered as (plan 5.6, 9.5). `null` means not yet validated, which is a
 * distinct state and is explicitly not defaulted to a pass.
 */
export const VERDICTS = ['supported', 'partial', 'contradicted', 'unsupported'] as const
export type Verdict = (typeof VERDICTS)[number]

export interface FactEvidence {
  evidence_id: string
  snippet: string
  speaker: string | null
  chunk_id: string | null
  char_start: number | null
  char_end: number | null
  verification_status: VerificationStatus
}

export interface FactListItem {
  id: string
  /** text + CHECK: churns as prompts are tuned. */
  fact_type: string
  content: string
  payload: Record<string, unknown> | null
  status: FactStatus
  /**
   * The generator's self-report, as a number.
   *
   * Weak and poorly calibrated -- the schema docstring records that this
   * corpus came back at exactly 1.00 across *every* fact, which is the
   * clearest possible demonstration that it carries no information. Shown
   * beside `verdict`, never as one.
   */
  confidence: number | null
  verdict: Verdict | null
  meeting_id: string | null
  document_id: string | null
  extracted_at: string | null
  /** Inline, so the table needs no second call. A fact with none cannot exist. */
  evidence: FactEvidence[]
}

export interface FactFilters {
  fact_type?: FactType[]
  status?: FactStatus[]
}

// ------------------------------------------------------------- Tasks (p11)

export const TASK_STATUSES = ['open', 'done', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface TaskListItem {
  id: string
  deal_id: string
  /** Carried because this list is cross-deal and a title alone is not actionable. */
  deal_name: string
  account_id: string
  account_name: string
  title: string
  due_date: string | null
  status: TaskStatus
  priority: Priority
  /** `ai` means it arrived by promotion, not by someone typing it. */
  origin: Origin
  /** Open and past due. Computed per request, never stored. */
  is_overdue: boolean
  completed_at: string | null
  created_at: string
}

export interface TaskDetail extends TaskListItem {
  description: string | null
  /** Set only by the Gate 3 promotion path. Read-only. */
  source_fact_id: string | null
  updated_at: string
}

export interface TaskCreate {
  deal_id: string
  title: string
  description?: string | null
  due_date?: string | null
  priority?: Priority
  status?: TaskStatus
}

export interface TaskUpdate {
  title?: string
  description?: string | null
  due_date?: string | null
  priority?: Priority
  status?: TaskStatus
}

export const TASK_SORT_KEYS = [
  'due_date',
  'priority',
  'status',
  'title',
  'deal_name',
  'created_at',
] as const
export type TaskSortKey = (typeof TASK_SORT_KEYS)[number]
export type TaskSort = TaskSortKey | `-${TaskSortKey}`

export interface TaskFilters {
  limit?: number
  offset?: number
  deal_id?: string
  account_id?: string
  status?: TaskStatus[]
  priority?: Priority[]
  origin?: Origin
  open?: boolean
  /** A task with no due date is never overdue -- undated is unscheduled. */
  overdue?: boolean
  due_before?: string
  due_after?: string
  has_due_date?: boolean
  q?: string
  sort?: TaskSort
}

// -------------------------------------------------------------- Chat (p10)

export type ChatScope = 'deal' | 'global'

export interface ChatSession {
  id: string
  scope: ChatScope
  deal_id: string | null
  title: string | null
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface ChatCitation {
  /** The handle the answer text refers to, e.g. `citation-1`. */
  handle: string
  source_kind: SourceKind
  snippet: string
  document_id: string | null
  chunk_id: string | null
  record_ref: RecordRef | null
  char_start: number | null
  char_end: number | null
}

export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status: string
  model: string | null
  token_usage: Record<string, unknown> | null
  latency_ms: number | null
  created_at: string
  citations: ChatCitation[]
}

/**
 * The three SSE event shapes, verified against `app/ai/chat.py`.
 *
 * **A provider failure arrives inside an HTTP 200.** The status code says
 * nothing; only the stream does. Groq returns 503 under load often enough that
 * this is the normal path rather than an edge case, so `error` is a first-class
 * outcome and not an exception.
 */
export type ChatStreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'error'; detail: string }
  | { type: 'done'; message_id: string }
