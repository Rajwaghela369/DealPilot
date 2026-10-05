import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ApiError } from '../../lib/api'
import { keys, meetings } from '../../lib/queries'
import type { MeetingDetail } from '../../lib/types'
import { formatDateTime, humanise, meetingAnalysisLabel, sentimentTone } from '../../lib/format'
import { errorMessage } from '../../lib/errorMessage'
import { Badge, Button, Card, useToast } from '../../components/ui'

export interface MeetingAnalysisPanelProps {
  meeting: MeetingDetail
  aiEnabled?: boolean
}

/**
 * Task 7.4: the analysis panel, including `failed` with its reason.
 *
 * Two things here are easy to get wrong and both would mislead:
 *
 * 1. **`failed` is terminal.** A run that fails a critical stage is recorded
 *    `failed` and is **not retried**, so the state has to be visible with a
 *    re-run button beside it. Without that a stuck meeting is
 *    indistinguishable from a slow one, forever.
 * 2. **`analysis_error` is set on `complete` runs too.** A meeting whose
 *    summary stage died still has its facts, and the backend records the
 *    partial failure while reporting the run complete. So the error is
 *    rendered independently of the status -- keying it to `failed` would make
 *    a degraded run read as clean, which is the more dangerous of the two
 *    mistakes.
 */
export function MeetingAnalysisPanel({ meeting, aiEnabled }: MeetingAnalysisPanelProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const analysis = useQuery({
    queryKey: keys.meetingAnalysis(meeting.deal_id, meeting.id),
    queryFn: () => meetings.analysis(meeting.deal_id, meeting.id),
    // Poll only while something is actually moving. A terminal state
    // (`complete`, `failed`, `not_started`) will not change on its own, and
    // polling it forever is pure waste.
    refetchInterval: (query) => {
      const status = query.state.data?.analysis_status
      return status === 'queued' || status === 'running' ? 5_000 : false
    },
  })

  const queue = useMutation({
    mutationFn: (force: boolean) =>
      meetings.queueAnalysis(meeting.deal_id, meeting.id, { force }),
    onSuccess: async (result) => {
      queryClient.setQueryData(keys.meetingAnalysis(meeting.deal_id, meeting.id), result)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.meeting(meeting.deal_id, meeting.id) }),
        queryClient.invalidateQueries({ queryKey: keys.meetings(meeting.deal_id) }),
      ])
      // 202, not 200: queued is the honest word here. Unlike the deal
      // detector, this genuinely is handed to the worker.
      toast.success('Queued. The worker picks it up on its next poll.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const data = analysis.data
  const label = data ? meetingAnalysisLabel(data.analysis_status) : null
  const complete = data?.analysis_status === 'complete'
  // A failed run is still a run that happened, so the verb is the same.
  // `force` is not: the server only 409s on `complete`, so passing it for a
  // failed meeting would be asking for an override nothing is blocking.
  const hasRun = complete || data?.analysis_status === 'failed'
  const conflict = queue.error instanceof ApiError && queue.error.status === 409

  return (
    <Card
      title="Analysis"
      description="Extraction, reconciliation and the summary, run by the worker over the transcript."
      actions={
        <Button
          size="sm"
          loading={queue.isPending}
          // `force` is required once complete -- the server answers 409
          // otherwise, so the flag matches what the button says it will do.
          onClick={() => queue.mutate(complete)}
          disabled={!data?.has_transcript}
          title={
            data?.has_transcript
              ? undefined
              : 'There is no transcript to analyse. Upload one on the Documents tab.'
          }
        >
          {hasRun ? 'Re-run' : 'Run analysis'}
        </Button>
      }
    >
      <div className="ui-stack">
        {label && (
          <div className="ui-row">
            <Badge tone={label.tone}>{label.label}</Badge>
            {data?.sentiment && (
              <Badge tone={sentimentTone(data.sentiment)}>
                {humanise(data.sentiment)} sentiment
              </Badge>
            )}
            {data?.analyzed_at && (
              <span className="ui-muted analysis-panel__queue">
                last run {formatDateTime(data.analyzed_at)}
              </span>
            )}
          </div>
        )}

        {label && <p className="brief__body ui-muted">{label.explanation}</p>}

        {/* Rendered whenever present, regardless of status -- see the note
            above. The wording differs because the same field means different
            things in the two cases. */}
        {data?.analysis_error && (
          <div
            className={`ui-callout ui-callout--${data.analysis_status === 'failed' ? 'danger' : 'warn'}`}
          >
            <strong>
              {data.analysis_status === 'failed'
                ? 'The run failed and will not retry itself.'
                : 'The run completed, but some stages did not.'}
            </strong>{' '}
            {data.analysis_status === 'complete' && (
              <>Whatever those stages produce is missing, while the rest is present. </>
            )}
            <span className="analysis-panel__error">{data.analysis_error}</span>
          </div>
        )}

        {conflict && (
          <div className="ui-callout ui-callout--warn">
            {errorMessage(queue.error)} Use <strong>Re-run</strong>, which sets that flag.
          </div>
        )}

        {!data?.has_transcript && (
          /* Task 7.7, stated where it matters. The transcript is not a nice
             extra -- it is the input, and without one the analyzer has
             nothing to read. */
          <div className="ui-callout ui-callout--info">
            <strong>No transcript attached.</strong> Analysis reads a transcript, so
            there is nothing to run yet. Upload one on the{' '}
            <Link to={`/deals/${meeting.deal_id}/documents`}>Documents tab</Link> with
            source type <em>meeting transcript</em>.
          </div>
        )}

        {aiEnabled === false && data?.has_transcript && (
          <div className="ui-callout ui-callout--warn">
            <strong>The AI layer is disabled.</strong> Queuing will add this meeting to a
            queue nothing is draining.
          </div>
        )}

        {complete && !data?.summary && !data?.analysis_error && (
          /* A complete run with no summary and no recorded error. Worth
             saying rather than leaving an empty panel that looks like a
             loading state that never finished. */
          <p className="ui-muted brief__meta">
            The run completed without producing a summary, and recorded no error. The
            facts and risks it extracted are on the Facts and Risks tabs.
          </p>
        )}

        {data?.summary && (
          <div className="brief__section">
            <h4 className="brief__heading">Summary</h4>
            <p className="brief__body">{data.summary}</p>
            {/* `meetings` has no `origin` column, so a human-typed summary
                and a generated one are indistinguishable once both exist.
                Said plainly rather than implying this text is the model's. */}
            <p className="ui-muted brief__meta">
              This field is writable by hand as well as by the analyzer, and meetings
              carry no origin column -- so this text cannot be attributed to either.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
