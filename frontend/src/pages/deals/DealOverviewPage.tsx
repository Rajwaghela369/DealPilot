import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deals, keys } from '../../lib/queries'
import type { DealUpdate } from '../../lib/types'
import {
  formatDate,
  formatDateTime,
  formatMoney,
  humanise,
  stageTone,
} from '../../lib/format'
import {
  Badge,
  Button,
  Card,
  Definition,
  Definitions,
  EmptyState,
  ErrorState,
  LoadingBlock,
  errorMessage,
  useToast,
} from '../../components/ui'
import { useDeal } from './dealContext'
import { DealEditForm } from './DealEditForm'
import './deals.css'

/**
 * Phase 3: the summary tab (tasks 3.3 and 3.4).
 *
 * The deal itself comes from the layout's context rather than a second fetch
 * -- that is the point of the layout route, and it is why switching tabs does
 * not re-request the record.
 */
export function DealOverviewPage() {
  const deal = useDeal()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [editing, setEditing] = useState(false)

  const history = useQuery({
    queryKey: keys.stageHistory(deal.id),
    // A bare array, ascending, unpaginated -- there are seven stages.
    queryFn: () => deals.stageHistory(deal.id),
  })

  const update = useMutation({
    mutationFn: (body: DealUpdate) => deals.update(deal.id, body),
    onSuccess: async () => {
      // `['deals', dealId]` catches the header and the stage history under it;
      // `['deals']` would also catch the pipeline list, which a rename or a
      // stage change changes too -- so both, shallowest first.
      await queryClient.invalidateQueries({ queryKey: keys.deals() })
      await queryClient.invalidateQueries({ queryKey: keys.deal(deal.id) })
      // A value or close-date edit marks the deal dirty server-side
      // (`analysis_service.record_change`), so the analysis badge is stale the
      // moment this succeeds.
      await queryClient.invalidateQueries({ queryKey: keys.dealAnalysis(deal.id) })
      setEditing(false)
      toast.success('Deal updated.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <div className="ui-stack">
      <Card
        title="Deal"
        actions={<Button size="sm" onClick={() => setEditing(true)}>Edit</Button>}
      >
        <Definitions>
          <Definition label="Stage">
            <Badge tone={stageTone(deal.stage)}>{humanise(deal.stage)}</Badge>
          </Definition>
          <Definition label="Value">{formatMoney(deal.value, deal.currency)}</Definition>
          <Definition label="Win probability">
            {/* Null is not 0%: nobody has estimated it. A zero would assert
                this deal is lost. */}
            {deal.win_probability === null ? (
              <span className="ui-muted">not estimated</span>
            ) : (
              `${deal.win_probability}%`
            )}
          </Definition>
          <Definition label="Expected close">
            {formatDate(deal.expected_close_date)}
          </Definition>
          <Definition label="Days in stage">{deal.days_in_stage}</Definition>
          <Definition label="Next action">
            {deal.next_action ? (
              <>
                {deal.next_action}
                {deal.next_action_due_date && (
                  <span className="ui-muted"> &middot; due {formatDate(deal.next_action_due_date)}</span>
                )}
              </>
            ) : (
              <span className="ui-muted" title="Derived from the oldest open task on this deal.">
                no open task
              </span>
            )}
          </Definition>
        </Definitions>
      </Card>

      <Card title="Activity" description="Counts from the deal record, in one fetch.">
        <Definitions>
          <Definition label="Open risks">{deal.counts.open_risks}</Definition>
          <Definition label="Open tasks">{deal.counts.open_tasks}</Definition>
          <Definition label="Open commitments">{deal.counts.open_commitments}</Definition>
          <Definition label="Stakeholders">{deal.counts.stakeholders}</Definition>
          <Definition label="Meetings">{deal.counts.meetings}</Definition>
          <Definition label="Documents">{deal.counts.documents}</Definition>
          <Definition label="Created">{formatDateTime(deal.created_at)}</Definition>
          <Definition label="Updated">{formatDateTime(deal.updated_at)}</Definition>
        </Definitions>
      </Card>

      {/* Task 3.4. Oldest first, because it reads as a progression and
          `days_in_stage` only makes sense forwards. */}
      <Card
        title="Stage history"
        description="Every transition this deal has made. Append-only -- a transition is something that happened, so it is never edited."
      >
        {history.isPending ? (
          <LoadingBlock label="Loading history..." />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={history.refetch} />
        ) : history.data.length === 0 ? (
          <EmptyState
            title="No transitions recorded"
            body="Every deal gets an opening entry when it is created, so an empty history means this deal predates that behaviour."
          />
        ) : (
          <ol className="stage-history">
            {history.data.map((entry, index) => {
              const latest = index === history.data.length - 1
              return (
                <li key={entry.id} className="stage-history__item">
                  <span
                    className={`stage-history__dot${latest ? ' is-current' : ''}`}
                    aria-hidden="true"
                  />
                  <div className="stage-history__body">
                    <div className="ui-row">
                      <Badge tone={latest ? stageTone(entry.to_stage) : 'neutral'}>
                        {humanise(entry.to_stage)}
                      </Badge>
                      <span className="ui-muted stage-history__from">
                        {entry.from_stage ? `from ${humanise(entry.from_stage)}` : 'opening stage'}
                      </span>
                    </div>
                    <div className="stage-history__when">
                      {formatDateTime(entry.changed_at)} &middot;{' '}
                      {/* The newest row is open-ended and measured against
                          now(), which is why it reads "still here" rather
                          than a closed duration. */}
                      {latest
                        ? `still here, ${entry.days_in_stage} day${entry.days_in_stage === 1 ? '' : 's'}`
                        : `${entry.days_in_stage} day${entry.days_in_stage === 1 ? '' : 's'} in stage`}
                    </div>
                    {entry.note && <p className="stage-history__note">{entry.note}</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </Card>

      {/* Noted rather than built. `GET /deals/{id}/timeline` does not exist --
          `activities` was dropped in migration 0007 because the timeline is
          derived, and the chat agent's `get_timeline` tool is the only thing
          that assembles one. A timeline UI needs a new endpoint, and inventing
          one client-side would mean asserting an ordering the server does not
          define. */}
      <p className="ui-muted" style={{ fontSize: 'var(--text-sm)' }}>
        A combined timeline is not shown: there is no{' '}
        <code>/deals/{'{id}'}/timeline</code> endpoint, and assembling one here would
        assert an ordering the API does not define.
      </p>

      {editing && (
        <DealEditForm
          deal={deal}
          busy={update.isPending}
          error={update.error}
          onSubmit={(body) => update.mutate(body)}
          onClose={() => {
            setEditing(false)
            update.reset()
          }}
        />
      )}
    </div>
  )
}
