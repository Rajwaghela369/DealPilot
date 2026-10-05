import type { EvidenceItem } from '../../lib/types'
import { isBroken } from '../../lib/verification'
import { EmptyState } from '../ui'
import { EvidenceRow } from './EvidenceRow'
import './evidence.css'

export interface EvidenceListProps {
  items: EvidenceItem[]
}

/**
 * Task 5.1: the list of citations behind one claim.
 *
 * Separate from the drawer so the same list can be rendered inline later --
 * phases 6, 9 and 10 all need "why does the system believe this?", and two of
 * them may want it expanded in place rather than in an overlay.
 *
 * Order comes from the server (`relevance` descending, nulls last) and is not
 * re-sorted here. Re-sorting by verification status was tempting and is wrong:
 * relevance is how strongly a span supports *this* claim, which is what makes
 * the first row the one worth reading, and promoting a weakly-relevant but
 * verified row above it would change what the claim appears to rest on.
 */
export function EvidenceList({ items }: EvidenceListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        tone="error"
        title="No evidence recorded"
        // This is not a neutral empty state. The product's entire claim is
        // that nothing is asserted without a link back to what backs it, so
        // a claim with no citations is a defect in the data, not a quiet
        // absence -- and Gate 0 is what should have caught it.
        body="Nothing backs this claim. The product's rule is that no assertion exists without a link to its source, so this is a gap rather than an empty list -- treat the claim as unsupported."
      />
    )
  }

  const broken = items.filter((item) => isBroken(item.verification_status)).length
  const stale = items.filter((item) => item.verification_status === 'stale').length

  return (
    <div className="ui-stack">
      {/* A summary only where it changes the reading of the list. With every
          link healthy there is nothing to warn about, and a banner saying so
          would be the kind of reassurance the drawer should not be offering. */}
      {broken > 0 && (
        <div className="ui-callout ui-callout--danger">
          {broken === items.length ? (
            <>
              <strong>Every citation here is broken.</strong> Nothing currently supports
              this claim.
            </>
          ) : (
            <>
              <strong>
                {broken} of {items.length} citations no longer hold.
              </strong>{' '}
              The claim rests on what is left.
            </>
          )}
        </div>
      )}
      {broken === 0 && stale > 0 && (
        <div className="ui-callout ui-callout--warn">
          <strong>
            {stale === items.length ? 'This evidence predates' : `${stale} of ${items.length} citations predate`}{' '}
            the deal&rsquo;s most recent activity.
          </strong>{' '}
          Still grounded, but something newer may have overtaken it.
        </div>
      )}

      <ol className="evidence__list">
        {items.map((item, index) => (
          <EvidenceRow
            key={item.id}
            item={item}
            // Only the strongest row opens by default: it is the one the
            // claim mostly rests on, and expanding all of them would put
            // several thousand words of transcript in a 520px drawer.
            defaultOpen={index === 0}
          />
        ))}
      </ol>
    </div>
  )
}
