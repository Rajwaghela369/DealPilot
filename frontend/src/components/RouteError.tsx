import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router'
import { Button, Card, EmptyState, errorMessage } from './ui'
import { PageHeader } from './PageHeader'

/**
 * The route-level error boundary (phase 0, "Features").
 *
 * Reached when a render throws or a route-level loader rejects. A query that
 * fails does *not* land here -- TanStack Query hands the error back to the
 * component, which renders `ErrorState` inside its own panel and keeps the
 * rest of the page usable. This boundary is for the case where the component
 * itself could not run, so there is no panel left to put a message in.
 *
 * "Reload" is a real reload, not a re-render: once a component has thrown
 * during render, React has unmounted that subtree, and re-rendering the same
 * broken state just throws again.
 */
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()

  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'This page could not be rendered'

  return (
    <div className="page">
      <PageHeader title="Something broke" />
      <Card>
        <EmptyState
          tone="error"
          title={title}
          body={errorMessage(error)}
          actions={
            <>
              <Button variant="primary" onClick={() => window.location.reload()}>
                Reload
              </Button>
              <Button onClick={() => navigate('/')}>Back to dashboard</Button>
            </>
          }
        />
      </Card>
    </div>
  )
}
