import type { ReactNode } from 'react'
import { ApiError } from '../../lib/api'
import { errorMessage } from '../../lib/errorMessage'
import { Button } from './Button'

export interface EmptyStateProps {
  title: ReactNode
  /** What to do about it. An empty state with no next step is a dead end. */
  body?: ReactNode
  actions?: ReactNode
  tone?: 'empty' | 'error'
}

/**
 * Task 0.7: one component, because every list in this app can legitimately be
 * empty on a fresh install, and per-page markup means twelve slightly
 * different versions of the same sentence.
 */
export function EmptyState({ title, body, actions, tone = 'empty' }: EmptyStateProps) {
  return (
    <div className={`ui-empty${tone === 'error' ? ' ui-empty--error' : ''}`}>
      <p className="ui-empty__title">{title}</p>
      {body && <p className="ui-empty__body">{body}</p>}
      {actions && <div className="ui-empty__actions">{actions}</div>}
    </div>
  )
}

export interface ErrorStateProps {
  error: unknown
  /** Wired to the query's `refetch`. Omitted for mutations. */
  onRetry?: () => void
  /** Overrides the heading, where a page knows what was being loaded. */
  title?: string
}

/**
 * The failure state for a panel or a list.
 *
 * A 404 is separated out because it is not a failure of the app: the id in the
 * URL does not exist, usually because the row was deleted in another tab, and
 * "Retry" cannot help. Offering it would be the UI pretending.
 */
export function ErrorState({ error, onRetry, title }: ErrorStateProps) {
  const notFound = error instanceof ApiError && error.status === 404

  return (
    <EmptyState
      tone="error"
      title={title ?? (notFound ? 'Not found' : 'That did not work')}
      body={errorMessage(error)}
      actions={
        onRetry && !notFound ? (
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  )
}
