import { useState } from 'react'
import { ApiError } from '../../lib/api'
import { clearKey } from '../../lib/formState'
import { PRIORITIES, isCorrectRecord } from '../../lib/types'
import type { Priority, RecommendationAccept, RecommendationDetail } from '../../lib/types'
import { humanise } from '../../lib/format'
import { Button, Drawer, SelectField, TextAreaField, TextField } from '../../components/ui'

export interface AcceptDialogProps {
  recommendation: RecommendationDetail
  busy?: boolean
  error?: unknown
  onSubmit: (body: RecommendationAccept) => void
  onClose: () => void
}

/** Today, as `YYYY-MM-DD` in local time. */
function todayLocal(): string {
  const now = new Date()
  // `toISOString()` would convert to UTC first, so east of Greenwich the
  // default due date can land on yesterday.
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** A week out, as the default due date. */
function defaultDue(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Task 6.4: accept a recommendation, which writes a task.
 *
 * A form rather than a one-click accept, because `due_date` is **required**
 * by `RecommendationAccept` and that is the whole point of the gesture: the
 * suggestion already exists, so accepting it adds nothing except a commitment
 * to *when*. Clicking straight through would make a 422 the default outcome.
 *
 * The other three fields are prefilled from the recommendation and sent only
 * when edited -- the server defaults each to the recommendation's own value,
 * so sending an untouched copy would just restate it.
 *
 * This is the hinge of the product: `risk -> recommendation -> [human
 * accepts] -> task`. Nothing before this point has changed a row, and nothing
 * after it happened without someone pressing a button.
 */
export function AcceptDialog({
  recommendation,
  busy,
  error,
  onSubmit,
  onClose,
}: AcceptDialogProps) {
  const [title, setTitle] = useState(recommendation.title)
  const [description, setDescription] = useState(recommendation.rationale ?? '')
  const [dueDate, setDueDate] = useState(defaultDue())
  const [priority, setPriority] = useState<Priority>(recommendation.priority)
  const [problems, setProblems] = useState<Record<string, string>>({})

  const fieldError = (path: string) =>
    problems[path] ?? (error instanceof ApiError ? error.fieldError(path) : undefined)

  const handleSubmit = () => {
    const next: Record<string, string> = {}
    const trimmedTitle = title.trim()
    if (!trimmedTitle) next.title = 'A task needs a title.'
    if (!dueDate) next.due_date = 'Accepting means committing to a date.'
    if (Object.keys(next).length) {
      setProblems(next)
      return
    }

    const body: RecommendationAccept = { due_date: dueDate }
    if (trimmedTitle !== recommendation.title) body.title = trimmedTitle
    const trimmedDescription = description.trim()
    if (trimmedDescription !== (recommendation.rationale ?? '')) {
      body.description = trimmedDescription || null
    }
    if (priority !== recommendation.priority) body.priority = priority

    onSubmit(body)
  }

  /**
   * The 409s, which are not failures to retry.
   *
   * "Already accepted" names the task it created and says to edit that
   * instead; "already dismissed" says nothing re-opens one. Both are the
   * backend telling the user what already happened, so the message is shown
   * verbatim and the submit button goes away -- offering "Accept" again under
   * a message saying it is already accepted would be absurd.
   */
  const conflict = error instanceof ApiError && error.status === 409 ? error.message : null

  const correction = isCorrectRecord(recommendation.action_type)

  return (
    <Drawer
      open
      onClose={onClose}
      title={correction ? 'Create a review task' : 'Accept and create a task'}
      description={recommendation.title}
      footer={
        conflict ? (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} loading={busy}>
              Create task
            </Button>
          </>
        )
      }
    >
      {conflict ? (
        <div className="ui-callout ui-callout--warn">{conflict}</div>
      ) : (
        <form
          className="ui-stack"
          onSubmit={(event) => {
            event.preventDefault()
            handleSubmit()
          }}
        >
          {error instanceof ApiError && error.status !== 409 && error.fields.length === 0 && (
            <div className="ui-callout ui-callout--danger">{error.message}</div>
          )}

          {/* Task 6.6, carried into the accept flow. For `correct_record` the
              task is "go and check whether this row is wrong", not "do the
              thing the title says" -- so the dialog says that rather than
              letting the user accept a data-correction claim as an action. */}
          {correction && (
            <div className="ui-callout ui-callout--info">
              This is a proposed <strong>data correction</strong>, not an action. The task
              records that a record needs reviewing -- it does not change anything itself.
            </div>
          )}

          <div className="ui-form-grid">
            <div className="ui-span-2">
              <TextField
                label="Task title"
                value={title}
                maxLength={255}
                error={fieldError('title')}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setProblems((current) => clearKey(current, 'title'))
                }}
              />
            </div>

            <TextField
              label="Due date"
              type="date"
              value={dueDate}
              min={todayLocal()}
              hint="Required. Accepting is a commitment to when, which is what separates a task from a suggestion."
              error={fieldError('due_date')}
              onChange={(event) => {
                setDueDate(event.target.value)
                setProblems((current) => clearKey(current, 'due_date'))
              }}
            />

            <SelectField
              label="Priority"
              value={priority}
              hint="Prefilled from the recommendation."
              error={fieldError('priority')}
              onChange={(event) => setPriority(event.target.value as Priority)}
            >
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {humanise(value)}
                </option>
              ))}
            </SelectField>

            <div className="ui-span-2">
              <TextAreaField
                label="Description"
                optional
                value={description}
                hint="Prefilled from the recommendation's rationale."
                error={fieldError('description')}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
        </form>
      )}
    </Drawer>
  )
}
