import { Button } from './Button'

export interface PagerProps {
  /** `Page.total` -- counted before the window, so this is every match. */
  total: number
  limit: number
  offset: number
  onOffsetChange: (offset: number) => void
  /** Dims the controls mid-fetch without collapsing the layout. */
  busy?: boolean
}

/**
 * The ninth primitive. Task 0.6 says to add one only when a page needs it, and
 * three do: accounts (1.1), the pipeline (2.1) and tasks (11.1).
 *
 * Page numbers come from a single request, which is the point of `total` being
 * counted *before* limit/offset on this backend (2.1). Nothing here estimates,
 * and nothing here fetches the next page to find out whether it exists.
 */
export function Pager({ total, limit, offset, onOffsetChange, busy }: PagerProps) {
  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil(total / limit))
  const first = total === 0 ? 0 : offset + 1
  const last = Math.min(offset + limit, total)

  // One page of results needs no controls, and an empty list needs them even
  // less -- the empty state is already saying what to do.
  if (total <= limit) return null

  return (
    <div className="ui-pager">
      <span className="ui-pager__range">
        {first}-{last} of {total}
      </span>
      <div className="ui-row">
        <Button
          size="sm"
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
          disabled={offset === 0 || busy}
        >
          Previous
        </Button>
        <span className="ui-pager__page">
          Page {page} of {pages}
        </span>
        <Button
          size="sm"
          onClick={() => onOffsetChange(offset + limit)}
          disabled={last >= total || busy}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
