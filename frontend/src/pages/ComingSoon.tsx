import { Badge, Card, EmptyState } from '../components/ui'
import { PageHeader } from '../components/PageHeader'

export interface ComingSoonProps {
  /** The plan phase that builds this, so the placeholder says when. */
  phase: string
  title: string
  body: string
}

/**
 * A route that exists and is not built yet.
 *
 * Deliberately not a blank page and not a 404: the route map in the plan is
 * the shape of the finished product, and the nav reflecting it is how the
 * sub-nav in phase 3 can show seven tabs without six of them looking broken.
 * Naming the phase keeps it from reading as a dead end.
 */
export function ComingSoon({ phase, title, body }: ComingSoonProps) {
  return (
    <div className="page">
      <PageHeader title={title} actions={<Badge>{phase}</Badge>} />
      <Card>
        <EmptyState title="Not built yet" body={body} />
      </Card>
    </div>
  )
}
