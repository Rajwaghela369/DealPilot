import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '../../lib/api'
import { clearKey } from '../../lib/formState'
import { deals, keys, tasks } from '../../lib/queries'
import { PRIORITIES, TASK_STATUSES } from '../../lib/types'
import type { Priority, TaskDetail, TaskListItem, TaskStatus } from '../../lib/types'
import { humanise } from '../../lib/format'
import { Button, Drawer, SelectField, TextAreaField, TextField } from '../../components/ui'

export interface TaskFormProps {
  /** Present when editing. The list row carries everything the form needs. */
  task?: TaskListItem
  onSaved: (task: TaskDetail) => void | Promise<void>
  onClose: () => void
}

/**
 * Tasks 11.2: create and edit.
 *
 * `deal_id` is required on create and **absent from `TaskUpdate`** -- moving a
 * task between deals would silently change which deal's "next action" it is,
 * so it is immutable and the picker only appears when creating.
 */
export function TaskForm({ task, onSaved, onClose }: TaskFormProps) {
  const [dealId, setDealId] = useState(task?.deal_id ?? '')
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'open')
  const [problems, setProblems] = useState<Record<string, string>>({})

  const dealOptions = useQuery({
    queryKey: keys.deals({ limit: 200, offset: 0, open: true }),
    queryFn: () => deals.list({ limit: 200, offset: 0, open: true }),
    enabled: !task,
  })

  const save = useMutation({
    mutationFn: () =>
      task
        ? tasks.update(task.id, {
            title: title.trim(),
            description: description.trim() || null,
            due_date: dueDate || null,
            priority,
            status,
          })
        : tasks.create({
            deal_id: dealId,
            title: title.trim(),
            description: description.trim() || null,
            due_date: dueDate || null,
            priority,
            status,
          }),
    onSuccess: (result) => onSaved(result),
  })

  const fieldError = (path: string) =>
    problems[path] ?? (save.error instanceof ApiError ? save.error.fieldError(path) : undefined)

  const handleSubmit = () => {
    const next: Record<string, string> = {}
    if (!title.trim()) next.title = 'A title is required.'
    if (!task && !dealId) next.deal_id = 'A task belongs to a deal.'
    if (Object.keys(next).length) {
      setProblems(next)
      return
    }
    save.mutate()
  }

  const rows = dealOptions.data?.items ?? []

  return (
    <Drawer
      open
      onClose={onClose}
      title={task ? 'Edit task' : 'New task'}
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={save.isPending}>
            {task ? 'Save' : 'Create task'}
          </Button>
        </>
      }
    >
      <form
        className="ui-stack"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {save.error instanceof ApiError && save.error.fields.length === 0 && (
          <div className="ui-callout ui-callout--danger">{save.error.message}</div>
        )}

        <div className="ui-form-grid">
          {!task && (
            <div className="ui-span-2">
              <SelectField
                label="Deal"
                value={dealId}
                disabled={dealOptions.isPending || rows.length === 0}
                hint="Immutable once set -- moving a task between deals would change which deal's next action it is."
                error={fieldError('deal_id')}
                onChange={(event) => {
                  setDealId(event.target.value)
                  setProblems((c) => clearKey(c, 'deal_id'))
                }}
              >
                <option value="">
                  {dealOptions.isPending ? 'Loading deals...' : 'Select a deal'}
                </option>
                {rows.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.name} -- {deal.account_name}
                  </option>
                ))}
              </SelectField>
            </div>
          )}

          <div className="ui-span-2">
            <TextField
              label="Title"
              value={title}
              autoFocus
              maxLength={255}
              error={fieldError('title')}
              onChange={(event) => {
                setTitle(event.target.value)
                setProblems((c) => clearKey(c, 'title'))
              }}
            />
          </div>

          <TextField
            label="Due date"
            optional
            type="date"
            value={dueDate}
            hint="Leaving it empty puts this in the unscheduled backlog, which is not the same as overdue."
            error={fieldError('due_date')}
            onChange={(event) => setDueDate(event.target.value)}
          />

          <SelectField
            label="Priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {humanise(p)}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as TaskStatus)}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </SelectField>

          <div className="ui-span-2">
            <TextAreaField
              label="Description"
              optional
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </div>
      </form>
    </Drawer>
  )
}
