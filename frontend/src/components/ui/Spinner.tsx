export interface SpinnerProps {
  /** Diameter in px. The border scales with nothing, so keep it 12-32. */
  size?: number
  /** Accessible name, when the spinner is the only thing on screen. */
  label?: string
}

export function Spinner({ size = 16, label }: SpinnerProps) {
  return (
    <span
      className="ui-spinner"
      style={{ width: size, height: size }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}

/**
 * The loading state for a whole panel or table body.
 *
 * Deliberately not a skeleton: a skeleton implies a known shape, and most
 * lists here can legitimately come back empty on a fresh install, so a
 * skeleton of three rows would promise rows that may not exist.
 */
export function LoadingBlock({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="ui-spinner-block">
      <Spinner size={18} />
      <span>{label}</span>
    </div>
  )
}
