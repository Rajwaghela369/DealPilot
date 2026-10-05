import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deals, keys, system } from '../../lib/queries'
import { analysisExplanation, analysisLabel, formatRelative } from '../../lib/format'
import { Badge, Button, errorMessage, useToast } from '../../components/ui'

export interface AnalysisPanelProps {
  dealId: string
}

/**
 * Tasks 3.5 and 3.6: the analysis state, the trigger, and whether anything is
 * listening.
 *
 * **One correction to the plan, deliberate.** Task 3.5 says `POST
 * /deals/{id}/analysis` "only marks the deal dirty" and that the button
 * therefore means *queued, never done*. The handler does not do that:
 * `run_detection` calls `detect_service.run` inline, commits, and answers
 * with counts of what it wrote. Six of the ten risk types are joins over
 * tables that already exist and need no model call, so the work genuinely
 * finishes inside the request.
 *
 * So the button is labelled for what it does -- it runs the deterministic
 * checks and reports results. Labelling it "queued" would be the same class
 * of dishonesty the plan is guarding against, pointed the other way: the user
 * would be told to wait for something that already happened.
 *
 * The dirty/debounce machinery is real, and it is what `GET .../analysis`
 * reports on: the worker marks deals dirty on relevant writes and sweeps them
 * on a debounce. That state is rendered below the button, and it is the half
 * that genuinely means *queued*.
 *
 * Task 3.6 is the other half. The deterministic detector runs in-process and
 * works with the worker stopped, but the model-backed stages do not -- so if
 * `ai-status` says the layer is disabled, that is said plainly rather than
 * leaving a user to infer it from a queue that never drains.
 */
export function AnalysisPanel({ dealId }: AnalysisPanelProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const state = useQuery({
    queryKey: keys.dealAnalysis(dealId),
    queryFn: () => deals.analysisState(dealId),
    // Polled, because this changes without the UI doing anything: the worker
    // claims dirty deals on its own 2s loop. 15s is slower than that on
    // purpose -- the state transitions are measured in the debounce window,
    // not in seconds, so a faster poll would only cost requests.
    refetchInterval: 15_000,
  })

  const ai = useQuery({
    queryKey: keys.aiStatus(),
    queryFn: system.aiStatus,
    refetchInterval: 60_000,
  })

  const run = useMutation({
    mutationFn: () => deals.runDetection(dealId),
    onSuccess: async (result) => {
      // The detector writes risks and recommendations and can resolve risks
      // that no longer hold, so the whole deal subtree is stale -- including
      // the header, whose `open_risks` count just moved.
      await queryClient.invalidateQueries({ queryKey: keys.deal(dealId) })
      await queryClient.invalidateQueries({ queryKey: keys.dealAnalysis(dealId) })

      const parts = [
        `${result.risks_detected} risk${result.risks_detected === 1 ? '' : 's'} detected`,
        `${result.recommendations_written} recommendation${result.recommendations_written === 1 ? '' : 's'} written`,
      ]
      if (result.risks_auto_resolved > 0) {
        parts.push(`${result.risks_auto_resolved} resolved`)
      }
      toast.success(parts.join(', ') + '.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const aiDisabled = ai.data && !ai.data.config.enabled
  const badge = state.data ? analysisLabel(state.data.state) : null

  return (
    <div className="analysis-panel">
      <div className="analysis-panel__status">
        {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}

        <div className="analysis-panel__detail">
          {state.data && (
            <p>
              {analysisExplanation(
                state.data.state,
                state.data.debounce_seconds,
                state.data.sweep_hours,
              )}
            </p>
          )}
          {state.data?.swept_at && (
            <p className="ui-muted">
              Last swept {formatRelative(state.data.swept_at)}
              {/* Why it was marked dirty. The worker records a reason like
                  `deal.value,expected_close_date`, and seeing it is the
                  difference between "something changed" and knowing what. */}
              {state.data.dirty_reason && <> &middot; triggered by {state.data.dirty_reason}</>}
            </p>
          )}
          {state.data && !state.data.swept_at && (
            <p className="ui-muted">This deal has never been swept.</p>
          )}
        </div>

        <Button onClick={() => run.mutate()} loading={run.isPending}>
          Run checks
        </Button>
      </div>

      {/* Task 3.6. Precise about what is and is not affected, because the
          deterministic detector behind "Run checks" works regardless -- the
          plan's own point in 6.7 is that an empty risk list never means
          "AI is off". */}
      {aiDisabled && (
        <div className="ui-callout ui-callout--warn">
          <strong>The AI layer is disabled.</strong> "Run checks" still works -- the
          deterministic detector needs no model -- but nothing will extract facts, write
          briefs or answer chat until the layer is enabled and the worker is running.
        </div>
      )}

      {/* The worker is a separate container, and a queue that only grows is
          how its absence shows up. `sweep_backlog` is the honest signal:
          the sweep claims one deal per pass by design, so a number that
          never falls means nothing is consuming it. */}
      {ai.data && ai.data.config.enabled && ai.data.queues.sweep_backlog > 0 && (
        <p className="analysis-panel__queue ui-muted">
          Worker backlog: {ai.data.queues.sweep_backlog} deal
          {ai.data.queues.sweep_backlog === 1 ? '' : 's'} awaiting a sweep
          {ai.data.queues.queued_meetings > 0 && (
            <>, {ai.data.queues.queued_meetings} meeting analysis queued</>
          )}
          . If these numbers never fall, the worker is not running.
        </p>
      )}
    </div>
  )
}
