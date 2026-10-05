import { useQuery } from '@tanstack/react-query'
import { health, keys } from '../lib/queries'

/**
 * The boot check from phase 0: `GET /health`, and a banner when it is unhappy.
 *
 * Worth a dedicated strip rather than letting each page fail on its own. Every
 * list in this app is legitimately empty on a fresh install, so a down backend
 * and an empty database produce near-identical screens -- "No accounts yet" is
 * the correct message for one and a lie for the other. This is what tells them
 * apart.
 *
 * Note it renders nothing at all while loading and nothing when healthy: a
 * green "API ok" bar on every page is noise, and the whole app below is
 * already the evidence that it works.
 */
export function BootCheck() {
  const { data, error } = useQuery({
    queryKey: keys.health(),
    queryFn: health.get,
    // The database can come back without a page reload, so keep asking --
    // but slowly, because this is a background sanity check and not a
    // monitoring system.
    refetchInterval: 30_000,
    retry: false,
  })

  // The fetch itself failed: no server at all.
  if (error) {
    return (
      <div className="boot-banner" role="alert">
        <strong>Cannot reach the API.</strong> Start the backend
        (<code>uvicorn app.main:app</code>) or the compose stack, then reload.
      </div>
    )
  }

  // Reachable, but answering 503 -- the API is up and Postgres is not. The
  // handler returns the exception text in `detail`, which is the only clue
  // about which half is broken, so it is shown rather than summarised.
  if (data && data.status !== 'ok') {
    return (
      <div className="boot-banner" role="alert">
        <strong>The API cannot reach its database.</strong>{' '}
        {data.detail ?? 'Every page below will fail until that is fixed.'}
      </div>
    )
  }

  return null
}
