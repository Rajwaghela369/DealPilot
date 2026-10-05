import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../lib/api'
import { keys, meetings } from '../../lib/queries'
import { formatDateTime } from '../../lib/format'
import { errorMessage } from '../../lib/errorMessage'
import { Button, Card, EmptyState, LoadingBlock, useToast } from '../../components/ui'

export interface BriefPanelProps {
  dealId: string
  meetingId: string
  /** From `ai-status`. A brief needs a model, unlike the risk detector. */
  aiEnabled?: boolean
}

function BriefList({ title, items }: { title: string; items: string[] | null }) {
  if (!items?.length) return null
  return (
    <div className="brief__section">
      <h4 className="brief__heading">{title}</h4>
      <ul className="brief__list">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Task 7.3: the brief panel.
 *
 * **GET first; POST only when absent.** The subtlety is that `GET .../brief`
 * answers **404 when no brief has been generated**, and that 404 is the
 * normal state of most meetings rather than an error -- so it is caught here
 * and rendered as an empty state with a generate button. Letting it fall
 * through to `ErrorState` would put a red panel on every meeting that simply
 * has not had a brief made yet.
 *
 * Regenerating is deliberately a separate, explicit action. `POST` without
 * `force` returns the stored brief, so the only way to replace one is to ask
 * for it -- and replacing is destructive: there is one brief row per meeting
 * and the previous text is gone. The button says "Replace", not "Refresh".
 */
export function BriefPanel({ dealId, meetingId, aiEnabled }: BriefPanelProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const brief = useQuery({
    queryKey: keys.meetingBrief(dealId, meetingId),
    queryFn: () => meetings.getBrief(dealId, meetingId),
    // A 404 here is "not generated", so it must not be retried as a failure.
    retry: false,
  })

  const generate = useMutation({
    mutationFn: (force: boolean) => meetings.generateBrief(dealId, meetingId, force),
    onSuccess: async (result) => {
      queryClient.setQueryData(keys.meetingBrief(dealId, meetingId), result)
      toast.success('Brief generated.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const notGenerated = brief.error instanceof ApiError && brief.error.status === 404

  // 503 is how `AIDisabled` reaches the client here -- one of the few places
  // a model outage is a status code rather than hidden inside a 200.
  const aiUnavailable =
    generate.error instanceof ApiError && generate.error.status === 503

  return (
    <Card
      title="Brief"
      description="Objectives, context and the questions worth asking. Generated once and stored."
      actions={
        brief.data ? (
          <Button
            size="sm"
            loading={generate.isPending}
            disabled={aiEnabled === false}
            onClick={() => generate.mutate(true)}
          >
            Replace
          </Button>
        ) : undefined
      }
    >
      {brief.isPending ? (
        <LoadingBlock label="Loading brief..." />
      ) : notGenerated ? (
        <EmptyState
          title="No brief yet"
          body={
            aiEnabled === false
              ? 'Generating a brief needs the AI layer, which is currently disabled. Unlike the risk detector, there is no deterministic version of this.'
              : 'A brief is written once and stored. Generate it before the meeting -- it reads the deal, its risks and the recent transcripts.'
          }
          actions={
            <Button
              variant="primary"
              size="sm"
              loading={generate.isPending}
              disabled={aiEnabled === false}
              onClick={() => generate.mutate(false)}
            >
              Generate brief
            </Button>
          }
        />
      ) : brief.isError ? (
        <EmptyState
          tone="error"
          title="The brief could not be loaded"
          body={errorMessage(brief.error)}
          actions={
            <Button size="sm" onClick={() => brief.refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <div className="ui-stack">
          {aiUnavailable && (
            <div className="ui-callout ui-callout--warn">
              {errorMessage(generate.error)} The brief below is the stored one.
            </div>
          )}

          {brief.data.context_summary && (
            <div className="brief__section">
              <h4 className="brief__heading">Context</h4>
              <p className="brief__body">{brief.data.context_summary}</p>
            </div>
          )}

          <BriefList title="Objectives" items={brief.data.objectives} />
          <BriefList title="Key risks" items={brief.data.key_risks} />
          <BriefList title="Questions to ask" items={brief.data.recommended_questions} />

          {/* Which model wrote it and when. Both matter for a generated
              artefact that is stored rather than recomputed: the text on
              screen may predate everything that has happened since. */}
          <p className="ui-muted brief__meta">
            Generated {formatDateTime(brief.data.generated_at)}
            {brief.data.model && <> by {brief.data.model}</>}. Replacing it overwrites this
            text -- there is one brief per meeting and no history.
          </p>
        </div>
      )}
    </Card>
  )
}
