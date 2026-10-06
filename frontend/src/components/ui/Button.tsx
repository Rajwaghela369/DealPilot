import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  /**
   * Shows a spinner and disables the button.
   *
   * Every mutating button in this app should use it: a `POST` that marks a
   * deal dirty or uploads a 25 MiB PDF is slow enough to be double-clicked,
   * and the second click is a second row.
   */
  loading?: boolean
  children?: ReactNode
}

export function Button({
  variant = 'default',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'ui-button',
    variant !== 'default' && `ui-button--${variant}`,
    size === 'sm' && 'ui-button--sm',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  )
}
