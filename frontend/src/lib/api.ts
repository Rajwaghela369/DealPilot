const API_BASE = '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((res) => res.ok)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

/**
 * Fetch wrapper for the DealPilot API. Cookies (access + refresh tokens) are
 * httpOnly, so this never touches tokens directly -- it just sends
 * credentials and, on a single 401, attempts one silent refresh + retry
 * before giving up. Callers never see the intermediate 401.
 */
export async function apiFetch(path: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  if (res.status === 401 && !isRetry && !path.startsWith('/auth/')) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      return apiFetch(path, init, true)
    }
  }

  return res
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.detail ?? `Request failed with status ${res.status}`)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return res.json() as Promise<T>
}
