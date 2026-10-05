import { useQuery } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { deals, keys } from '../../lib/queries'
import type { DealDetail } from '../../lib/types'
import { formatDate, formatMoney, formatRelative, humanise, riskTone, stageTone } from '../../lib/format'
import { Badge, Button, Card, ErrorState, LoadingBlock } from '../../components/ui'
import { DealContext } from './dealContext'
import { AnalysisPanel } from './AnalysisPanel'
import './deals.css'

const TABS = [
  { to: 'overview', label: 'Overview' },
  { to: 'risks', label: 'Risks' },
  { to: 'meetings', label: 'Meetings' },
  { to: 'people', label: 'People' },
  { to: 'documents', label: 'Documents' },
  { to: 'facts', label: 'Facts' },
  { to: 'chat', label: 'Chat' },
]

/**
 * Phase 3: the container every deal-scoped page mounts into.
 *
 * Header once, tabs below it, `<Outlet/>` under those. The counts in the
 * header come from `DealDetail.counts`, which the backend assembles in a
 * single round trip with six correlated subqueries -- so showing them costs
 * nothing extra, and they are what make the tabs worth clicking or not.
 */
export function DealLayout() {
  const { dealId = '' } = useParams()

  const deal = useQuery({
    queryKey: keys.deal(dealId),
    queryFn: () => deals.get(dealId),
  })

  if (deal.isPending) {
    return (
      <div className="page">
        <LoadingBlock label="Loading deal..." />
      </div>
    )
  }

  if (deal.isError) {
    return (
      <div className="page">
        <Card>
          <ErrorState
            error={deal.error}
            onRetry={deal.refetch}
            title="This deal could not be loaded"
          />
          <div className="ui-empty__actions" style={{ justifyContent: 'center' }}>
            <Link to="/deals">
              <Button>Back to pipeline</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  const data = deal.data

  return (
    <DealContext.Provider value={data}>
      <div className="page">
        <header className="deal-header">
          <div className="deal-header__top">
            <div>
              <Link to="/deals" className="deal-header__back">
                &larr; Pipeline
              </Link>
              <h1 className="page-title">{data.name}</h1>
              <p className="deal-header__account">
                <Link to={`/accounts/${data.account.id}`}>{data.account.name}</Link>
                {data.account.industry && (
                  <span className="ui-muted"> &middot; {data.account.industry}</span>
                )}
              </p>
            </div>

            <div className="deal-header__meta">
              <Badge tone={stageTone(data.stage)}>{humanise(data.stage)}</Badge>
              {data.risk_level && (
                <Badge tone={riskTone(data.risk_level)}>
                  {humanise(data.risk_level)} risk
                </Badge>
              )}
              <span className="deal-header__value">
                {formatMoney(data.value, data.currency)}
              </span>
            </div>
          </div>

          <div className="deal-header__facts">
            <span>
              close <strong>{formatDate(data.expected_close_date)}</strong>
            </span>
            <span>
              last activity <strong>{formatRelative(data.last_activity_at)}</strong>
            </span>
            <span>
              <strong>{data.days_in_stage}</strong> days in stage
            </span>
            {data.closed_at && (
              <span>
                closed <strong>{formatDate(data.closed_at)}</strong>
              </span>
            )}
          </div>

          {/* Tasks 3.5 and 3.6 live here rather than on the Overview tab so
              the analysis state is visible from every tab -- a risks list
              rendered while a pass is pending is a stale list, and the tab
              that most needs to say so is not the one that owns the button. */}
          <AnalysisPanel dealId={data.id} />

          {/* Task 3.2. `NavLink`s, so the active tab is the URL. The counts
              are from the single header fetch. */}
          <nav className="deal-tabs">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) => `deal-tab${isActive ? ' active' : ''}`}
              >
                {tab.label}
                {tabCount(tab.to, data) !== null && (
                  <span className="deal-tab__count">{tabCount(tab.to, data)}</span>
                )}
              </NavLink>
            ))}
          </nav>
        </header>

        <Outlet />
      </div>
    </DealContext.Provider>
  )
}

/**
 * The badge beside a tab name, or null where there is no honest number.
 *
 * Facts and chat have no count in `DealCounts`, so they get none -- a zero
 * there would say "no facts" when what is true is "this payload does not
 * carry that number". Risks shows *open* risks, which is the number the
 * detector's `open` status actually means.
 */
function tabCount(tab: string, deal: DealDetail): number | null {
  switch (tab) {
    case 'risks':
      return deal.counts.open_risks
    case 'meetings':
      return deal.counts.meetings
    case 'people':
      return deal.counts.stakeholders
    case 'documents':
      return deal.counts.documents
    default:
      return null
  }
}
