/**
 * Transport for the DealPilot API.
 *
 * There is no auth layer and there is not going to be one: the backend serves
 * a single user, exposes no `/auth/*` and returns no 401s
 * (`docs/frontend/PLAN.md`, "API conventions that will bite", #8). So no
 * `credentials: 'include'`, no silent refresh, no 401 retry -- all three were
 * here for a token flow that does not exist.
 *
 * What does need care is the error shape, because this backend has two of
 * them. A handler that raises `HTTPException` sends `detail` as a string, and
 * those strings are written to be read by a person -- `services/account.py`
 * names the contact already using an email, `accounts.py` says how many deals
 * block a delete, and `services/ingest.py` says to re-save a `.doc` as
 * `.docx`. FastAPI's own validation failures send `detail` as an array of
 * `{loc, msg}` objects instead. Flattening both into one `message` here is
 * what lets every caller render `err.message` and be right, and keeping
 * `fields` alongside it is what makes a 422 point at the input that caused it
 * (plan 1.2, 2.2).
 */

const API_BASE = '/api/v1'

/** One `{loc, msg}` entry from a FastAPI validation failure. */
interface ValidationDetail {
  loc?: (string | number)[]
  msg?: string
}

/**
 * A field name a 422 complained about, paired with the reason.
 *
 * `path` drops the leading `body` / `query` segment, so it matches the name
 * the form input uses rather than the wire envelope.
 */
export interface FieldError {
  path: string
  message: string
}

export class ApiError extends Error {
  readonly status: number
  /** The raw `detail`, for the rare caller that needs more than the message. */
  readonly detail: unknown
  /** Non-empty only for a 422. */
  readonly fields: FieldError[]

  constructor(status: number, message: string, detail: unknown, fields: FieldError[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.fields = fields
  }

  /** The reason this field was rejected, if the server named it. */
  fieldError(path: string): string | undefined {
    return this.fields.find((f) => f.path === path)?.message
  }
}

/** Thrown when the request never reached the server -- the API is down. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Cannot reach the API. Is the backend running?')
    this.name = 'NetworkError'
    this.cause = cause
  }
}

function isValidationDetail(detail: unknown): detail is ValidationDetail[] {
  return Array.isArray(detail) && detail.every((d) => typeof d === 'object' && d !== null)
}

function parseFields(detail: ValidationDetail[]): FieldError[] {
  return detail.map((entry) => {
    const loc = entry.loc ?? []
    // Strip the envelope segment: `['body', 'name']` is the `name` field.
    const path = loc
      .filter((part, i) => !(i === 0 && (part === 'body' || part === 'query' || part === 'path')))
      .join('.')
    return { path, message: entry.msg ?? 'is not valid' }
  })
}

/**
 * Turn a response body into one sentence.
 *
 * A string `detail` is used verbatim -- the backend writes these to be shown,
 * and paraphrasing them loses the actionable half (plan 4.2).
 */
function toError(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown } | null)?.detail

  if (typeof detail === 'string' && detail.trim()) {
    return new ApiError(status, detail, detail)
  }

  if (isValidationDetail(detail)) {
    const fields = parseFields(detail)
    const message = fields.length
      ? fields.map((f) => `${f.path || 'request'}: ${f.message}`).join('; ')
      : `Request failed with status ${status}`
    return new ApiError(status, message, detail, fields)
  }

  return new ApiError(status, `Request failed with status ${status}`, detail ?? null)
}

export interface ApiRequest extends Omit<RequestInit, 'body'> {
  /** Serialised as JSON unless it is already a `FormData` / `BodyInit`. */
  body?: unknown
  /**
   * Appended as a query string; `undefined`, `null` and `''` are dropped.
   *
   * Typed as `object` rather than `Record<string, unknown>` so a filter
   * *interface* can be passed directly. An interface without an index
   * signature is not assignable to that `Record`, and widening every filter
   * type to carry one would give up the exact-key checking that makes a
   * misspelled parameter a compile error here instead of a 422 at runtime.
   */
  query?: object
}

/**
 * Build the query string.
 *
 * Two rules, both forced by the backend:
 *
 * 1. **Empty values are omitted, not sent blank.** Every filter model sets
 *    `extra="forbid"` and constrains its strings with `min_length=1`, so
 *    `?q=` is a 422 rather than an unfiltered list. A cleared search box must
 *    send no `q` at all.
 * 2. **An array becomes a repeated parameter.** `stage` and `risk_level` are
 *    `List[...]` on the server, which FastAPI reads as `?stage=a&stage=b`.
 *    Letting `String(value)` stringify the array instead would send
 *    `?stage=a,b` and be rejected as an unknown enum member.
 */
function buildQuery(query: object | undefined): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry === undefined || entry === null || entry === '') continue
        params.append(key, String(entry))
      }
      continue
    }
    params.append(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** The raw response, for the callers that need headers or a redirect. */
export async function apiFetch(path: string, init: ApiRequest = {}): Promise<Response> {
  const { body, query, headers, ...rest } = init

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const sendsJson = body !== undefined && !isFormData

  try {
    return await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
      ...rest,
      // A multipart body must set its own boundary, so `Content-Type` is left
      // to the browser when the body is FormData (plan 4.1).
      headers: {
        ...(sendsJson ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: sendsJson ? JSON.stringify(body) : (body as BodyInit | undefined),
    })
  } catch (cause) {
    throw new NetworkError(cause)
  }
}

/**
 * Build an `ApiError` from a failed response.
 *
 * Exported for the one caller that cannot use `apiJson`: document upload
 * needs the success *status code* (201 new vs 200 already-stored), so it
 * handles the response itself and reuses this for the failure path -- which
 * matters, because upload is where the readable refusals live (plan 4.2).
 */
export async function toApiError(res: Response): Promise<ApiError> {
  return toError(res.status, await res.json().catch(() => null))
}

/** A JSON request. Throws `ApiError` on any non-2xx. */
export async function apiJson<T>(path: string, init?: ApiRequest): Promise<T> {
  const res = await apiFetch(path, init)

  if (!res.ok) {
    throw toError(res.status, await res.json().catch(() => null))
  }

  // 204 is the documented success for every DELETE here.
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  return (await res.json()) as T
}

/**
 * `GET /health` -- liveness plus database reachability.
 *
 * Unversioned and outside `/api` by design (`app/main.py`), so it does not go
 * through `apiJson`. It answers 503 with a body rather than failing, and the
 * body is the interesting part, so the status is reported instead of thrown.
 */
export interface HealthReport {
  status: 'ok' | 'unhealthy'
  database: 'ok' | 'unreachable'
  detail?: string
}

export async function fetchHealth(): Promise<HealthReport> {
  try {
    const res = await fetch('/health')
    return (await res.json()) as HealthReport
  } catch (cause) {
    throw new NetworkError(cause)
  }
}
