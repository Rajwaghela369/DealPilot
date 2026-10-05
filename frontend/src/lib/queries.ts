/**
 * Query keys and typed fetchers, in one place.
 *
 * Task 0.5 asks for one `queryKey` convention, and it is this: the key mirrors
 * the URL path, with the filter object last.
 *
 *     ['health']
 *     ['accounts', filters]
 *     ['accounts', accountId]
 *     ['accounts', accountId, 'contacts', filters]
 *     ['deals', filters]
 *     ['deals', dealId]
 *     ['deals', dealId, 'risks', filters]
 *
 * The property that makes it worth a convention: invalidating a prefix
 * invalidates everything under it. `invalidateQueries({queryKey: ['deals',
 * dealId]})` catches the deal and all seven of its tabs, which is what a
 * `PATCH` needs, and `['deals']` alone catches the pipeline list too. So a
 * mutation names the shallowest prefix it actually invalidates and gets the
 * rest for free.
 *
 * Each fetcher returns the raw response shape. Two of them, because this API
 * has two envelopes (`types.ts`, `Page<T>`): the paginated endpoints hand back
 * `Page<T>` and the deal sub-resources hand back `T[]`.
 */

import { apiFetch, apiJson, fetchHealth, toApiError } from './api'
import type {
  Account,
  AccountListItem,
  AccountWrite,
  Contact,
  ContactWrite,
  DealAnalysisStateResponse,
  DealCreate,
  DealDetail,
  DealFilters,
  DealListItem,
  DealUpdate,
  DetectionResult,
  AIStatus,
  ChunkDetail,
  ClaimType,
  DocumentDetail,
  DocumentFilters,
  DocumentListItem,
  DocumentSourceType,
  EvidenceItem,
  Page,
  RecommendationAccept,
  RecommendationDetail,
  RecommendationDismiss,
  RecommendationFilters,
  RiskFilters,
  RiskListItem,
  RiskUpdate,
  StageHistoryEntry,
} from './types'

/** Query-string shape for the accounts list. */
export interface AccountFilters {
  limit?: number
  offset?: number
  /** Case-insensitive substring on name. Must be non-empty if sent. */
  q?: string
}

export interface ContactFilters {
  q?: string
}

/**
 * Every key the app uses. Centralised so a typo is a type error rather than a
 * cache entry nothing ever invalidates -- the failure mode where a mutation
 * appears to work and the list never updates.
 */
export const keys = {
  health: () => ['health'] as const,
  aiStatus: () => ['system', 'ai-status'] as const,

  accounts: (filters?: AccountFilters) =>
    filters ? (['accounts', filters] as const) : (['accounts'] as const),
  account: (accountId: string) => ['accounts', accountId] as const,
  contacts: (accountId: string, filters?: ContactFilters) =>
    filters
      ? (['accounts', accountId, 'contacts', filters] as const)
      : (['accounts', accountId, 'contacts'] as const),

  deals: (filters?: DealFilters) =>
    filters ? (['deals', filters] as const) : (['deals'] as const),
  deal: (dealId: string) => ['deals', dealId] as const,
  stageHistory: (dealId: string) => ['deals', dealId, 'stage-history'] as const,
  dealAnalysis: (dealId: string) => ['deals', dealId, 'analysis'] as const,

  documents: (dealId: string, filters?: DocumentFilters) =>
    filters
      ? (['deals', dealId, 'documents', filters] as const)
      : (['deals', dealId, 'documents'] as const),
  /** Top-level: reached from a preview link holding only a document id. */
  document: (documentId: string) => ['documents', documentId] as const,

  /**
   * Evidence hangs under its claim, not under a top-level `evidence` key.
   *
   * That is what makes `invalidateQueries(['deals', dealId])` after a
   * detector run drop the cached evidence too -- the run can rewrite both the
   * claim and what backs it.
   */
  evidence: (dealId: string, claimType: ClaimType, claimId: string) =>
    ['deals', dealId, claimType === 'risk' ? 'risks' : 'recommendations', claimId, 'evidence'] as const,
  /** Top-level: a chat citation carries a chunk id and no document. */
  chunk: (chunkId: string) => ['chunks', chunkId] as const,

  risks: (dealId: string, filters?: RiskFilters) =>
    filters
      ? (['deals', dealId, 'risks', filters] as const)
      : (['deals', dealId, 'risks'] as const),
  recommendations: (dealId: string, filters?: RecommendationFilters) =>
    filters
      ? (['deals', dealId, 'recommendations', filters] as const)
      : (['deals', dealId, 'recommendations'] as const),

  /** Phase 11's list. Named here because accepting a recommendation writes one. */
  tasks: () => ['tasks'] as const,
} as const

// ------------------------------------------------------------------ System

export const health = {
  get: fetchHealth,
}

export const system = {
  aiStatus: () => apiJson<AIStatus>('/system/ai-status'),
}

// ---------------------------------------------------------------- Accounts

export const accounts = {
  list: (filters: AccountFilters) =>
    apiJson<Page<AccountListItem>>('/accounts', { query: filters }),

  get: (accountId: string) => apiJson<Account>(`/accounts/${accountId}`),

  create: (body: AccountWrite) =>
    apiJson<Account>('/accounts', { method: 'POST', body }),

  /** Partial. Send only changed keys -- the backend reads `exclude_unset`. */
  update: (accountId: string, body: Partial<AccountWrite>) =>
    apiJson<Account>(`/accounts/${accountId}`, { method: 'PATCH', body }),

  /** 409 when the account still has deals; the `detail` says how many. */
  remove: (accountId: string) =>
    apiJson<void>(`/accounts/${accountId}`, { method: 'DELETE' }),
}

export const contacts = {
  /** A bare array: unpaginated, because this is the stakeholder picker. */
  list: (accountId: string, filters: ContactFilters = {}) =>
    apiJson<Contact[]>(`/accounts/${accountId}/contacts`, { query: filters }),

  get: (accountId: string, contactId: string) =>
    apiJson<Contact>(`/accounts/${accountId}/contacts/${contactId}`),

  /** 409 on a duplicate email, naming the contact already using it. */
  create: (accountId: string, body: ContactWrite) =>
    apiJson<Contact>(`/accounts/${accountId}/contacts`, { method: 'POST', body }),

  update: (accountId: string, contactId: string, body: Partial<ContactWrite>) =>
    apiJson<Contact>(`/accounts/${accountId}/contacts/${contactId}`, {
      method: 'PATCH',
      body,
    }),

  /** 204. Unresolves meeting attendees rather than deleting their rows. */
  remove: (accountId: string, contactId: string) =>
    apiJson<void>(`/accounts/${accountId}/contacts/${contactId}`, { method: 'DELETE' }),
}

// ------------------------------------------------------------------- Deals

export const deals = {
  /**
   * The pipeline table.
   *
   * `filters` goes straight to `buildQuery`, which spreads `stage` and
   * `risk_level` into repeated parameters -- they are `List[...]` on the
   * server, so `?stage=discovery&stage=evaluation` is the shape it reads.
   */
  list: (filters: DealFilters) =>
    apiJson<Page<DealListItem>>('/deals', { query: filters }),

  get: (dealId: string) => apiJson<DealDetail>(`/deals/${dealId}`),

  create: (body: DealCreate) => apiJson<DealDetail>('/deals', { method: 'POST', body }),

  update: (dealId: string, body: DealUpdate) =>
    apiJson<DealDetail>(`/deals/${dealId}`, { method: 'PATCH', body }),

  remove: (dealId: string) => apiJson<void>(`/deals/${dealId}`, { method: 'DELETE' }),

  /** A bare array, oldest first. Unpaginated: there are seven stages. */
  stageHistory: (dealId: string) =>
    apiJson<StageHistoryEntry[]>(`/deals/${dealId}/stage-history`),

  analysisState: (dealId: string) =>
    apiJson<DealAnalysisStateResponse>(`/deals/${dealId}/analysis`),

  /**
   * Runs the deterministic detector **synchronously** and returns what it
   * wrote.
   *
   * Worth being precise, because the plan (3.5) describes this as marking the
   * deal dirty for the worker to pick up, and the handler does not do that --
   * `run_detection` calls `detect_service.run` inline and commits. Six of the
   * ten risk types need no model at all, so this genuinely completes within
   * the request. The UI therefore reports results, not "queued"; the dirty /
   * debounce path is what `GET .../analysis` reports on, and the worker owns
   * it.
   */
  runDetection: (dealId: string) =>
    apiJson<DetectionResult>(`/deals/${dealId}/analysis`, { method: 'POST' }),
}

// --------------------------------------------------------------- Documents

export const documents = {
  /** A bare array -- NOT a `Page`. This endpoint is unpaginated (plan 4.6). */
  list: (dealId: string, filters: DocumentFilters = {}) =>
    apiJson<DocumentListItem[]>(`/deals/${dealId}/documents`, { query: filters }),

  get: (documentId: string) => apiJson<DocumentDetail>(`/documents/${documentId}`),

  /**
   * Upload one file.
   *
   * `multipart/form-data`, assembled here rather than by the caller so the
   * **required** `source_type` cannot be forgotten -- omitting it is a 422
   * that reads like a bug (plan 4.1). `api.ts` leaves `Content-Type` unset
   * for a `FormData` body so the browser writes its own boundary.
   *
   * Returns the document either way, and the status code is the interesting
   * part: **201 for a new document, 200 for one already stored.** `documents`
   * carries `UNIQUE(content_hash)`, so a re-upload is idempotent by design
   * rather than an error -- but a UI that reported "uploaded" for a 200 would
   * be claiming it stored a second copy. `duplicate` is that distinction,
   * which is why this does not go through `apiJson`.
   */
  upload: async (
    dealId: string,
    input: { file: File; source_type: DocumentSourceType; title?: string; occurred_at?: string },
  ): Promise<{ document: DocumentDetail; duplicate: boolean }> => {
    const body = new FormData()
    body.append('file', input.file)
    body.append('source_type', input.source_type)
    if (input.title?.trim()) body.append('title', input.title.trim())
    if (input.occurred_at) body.append('occurred_at', input.occurred_at)

    const res = await apiFetch(`/deals/${dealId}/documents`, { method: 'POST', body })
    if (!res.ok) {
      throw await toApiError(res)
    }
    return { document: (await res.json()) as DocumentDetail, duplicate: res.status === 200 }
  },

  /** 204. Clears citation links first; the claims survive, now uncited. */
  remove: (documentId: string) =>
    apiJson<void>(`/documents/${documentId}`, { method: 'DELETE' }),

  /**
   * The preview URL to navigate to (plan 4.4).
   *
   * Deliberately the *endpoint* rather than the presigned URL it redirects
   * to. The 302 points at object storage on a different origin with a
   * 15-minute signature, so the UI opens this path and lets the browser
   * follow the redirect: that fetches a fresh signature per view, never
   * caches one, and avoids reading a cross-origin response the client has no
   * business reading.
   */
  previewPath: (documentId: string) => `/api/v1/documents/${documentId}/preview`,
}

// ---------------------------------------------------------------- Evidence

export const evidence = {
  /** Citations for one risk, strongest `relevance` first. */
  forRisk: (dealId: string, riskId: string) =>
    apiJson<EvidenceItem[]>(`/deals/${dealId}/risks/${riskId}/evidence`),

  forRecommendation: (dealId: string, recId: string) =>
    apiJson<EvidenceItem[]>(`/deals/${dealId}/recommendations/${recId}/evidence`),

  /** Either of the above, picked by claim type. */
  forClaim: (dealId: string, claimType: ClaimType, claimId: string) =>
    claimType === 'risk'
      ? evidence.forRisk(dealId, claimId)
      : evidence.forRecommendation(dealId, claimId),
}

export const chunks = {
  /** Resolve a citation handle to its text (plan 5.3). */
  get: (chunkId: string) => apiJson<ChunkDetail>(`/chunks/${chunkId}`),
}

// ------------------------------------------------------------------- Risks

export const risks = {
  /** A bare array; at most ~10 rows, one per risk type. Severity-ordered. */
  list: (dealId: string, filters: RiskFilters = {}) =>
    apiJson<RiskListItem[]>(`/deals/${dealId}/risks`, { query: filters }),

  /**
   * Record the human decision. Only `status` is writable.
   *
   * The detector owns `risk_type`, `title`, `description`, `severity` and
   * `confidence` -- editing what it asserted would destroy the record of what
   * it asserted. If a risk is wrong, the honest move is to dismiss it, which
   * is why there is no edit form on a risk card.
   */
  updateStatus: (dealId: string, riskId: string, body: RiskUpdate) =>
    apiJson<RiskListItem>(`/deals/${dealId}/risks/${riskId}`, { method: 'PATCH', body }),
}

// ------------------------------------------------------- Recommendations

export const recommendations = {
  /** A bare array, newest first. */
  list: (dealId: string, filters: RecommendationFilters = {}) =>
    apiJson<RecommendationDetail[]>(`/deals/${dealId}/recommendations`, { query: filters }),

  /**
   * Accept: writes a task and points the recommendation at it.
   *
   * Two 409s, both of which name what already happened rather than just
   * refusing: already accepted (gives the task id, "edit that task rather
   * than accepting again") and already dismissed ("nothing re-opens a
   * dismissed suggestion").
   */
  accept: (dealId: string, recId: string, body: RecommendationAccept) =>
    apiJson<RecommendationDetail>(`/deals/${dealId}/recommendations/${recId}/accept`, {
      method: 'POST',
      body,
    }),

  /**
   * Dismiss: records that a human said no, and why.
   *
   * Remembered rather than deleted, for two reasons the UI should respect:
   * the detector must not re-suggest it next run, and the reason distribution
   * is the only signal that says whether the advice is any good. 409 if it
   * was already accepted.
   */
  dismiss: (dealId: string, recId: string, body: RecommendationDismiss) =>
    apiJson<RecommendationDetail>(`/deals/${dealId}/recommendations/${recId}/dismiss`, {
      method: 'POST',
      body,
    }),
}
