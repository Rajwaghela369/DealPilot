import { useId } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface FieldShellProps {
  label: ReactNode
  /** Marked rather than `required`: see the note in `ui.css`. */
  optional?: boolean
  hint?: ReactNode
  /**
   * The reason this input was rejected. Pass the server's own string when it
   * named this field -- `ApiError.fieldError(path)` returns exactly that.
   */
  error?: string
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}

/**
 * Label, hint and error around one control.
 *
 * The render-prop shape is so the label's `htmlFor`, the hint's id and the
 * `aria-describedby` that ties them together are generated once here instead
 * of at every call site, where they get forgotten.
 */
export function Field({ label, optional, hint, error, children }: FieldShellProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
        {optional && <span className="ui-field__optional">optional</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ui-field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}

type ShellProps = Pick<FieldShellProps, 'label' | 'optional' | 'hint' | 'error'>

export interface TextFieldProps
  extends ShellProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {}

export function TextField({ label, optional, hint, error, ...input }: TextFieldProps) {
  return (
    <Field label={label} optional={optional} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          {...input}
          id={id}
          className="ui-input"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        />
      )}
    </Field>
  )
}

export interface SelectFieldProps
  extends ShellProps,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> {
  children: ReactNode
}

export function SelectField({ label, optional, hint, error, children, ...select }: SelectFieldProps) {
  return (
    <Field label={label} optional={optional} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <select
          {...select}
          id={id}
          className="ui-select"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        >
          {children}
        </select>
      )}
    </Field>
  )
}

export interface TextAreaFieldProps
  extends ShellProps,
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> {}

export function TextAreaField({ label, optional, hint, error, ...textarea }: TextAreaFieldProps) {
  return (
    <Field label={label} optional={optional} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <textarea
          {...textarea}
          id={id}
          className="ui-textarea"
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        />
      )}
    </Field>
  )
}
