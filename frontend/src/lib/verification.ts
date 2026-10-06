import type { BadgeTone } from '../components/ui/Badge'
import type { SourceKind, VerificationStatus } from './types'

/**
 * Task 5.5, and the most load-bearing colour decision in the app.
 *
 * `verification_status` is Gate 0's check of one claim -> evidence link, plus
 * Gate 2's staleness pass. Five values, and the plan requires two of them to
 * be visually distinguishable because they are different answers to "can I
 * trust this":
 *
 * - **`stale` is amber.** The link *was* verified -- Gate 2 writes `stale`
 *   only over `verified`, never over a worse diagnosis -- and then the deal
 *   moved on. The quote is real and still says what it said; it may simply
 *   have been overtaken. A grounded claim that is no longer current is a
 *   different thing from a wrong one, and the plan says so explicitly.
 * - **`span_missing` and `value_drifted` are red.** The source no longer
 *   supports the claim: either the quoted text is not where it was recorded,
 *   or the record field it cited now holds a different value. These are the
 *   states the plan calls "rejected" in 5.5 -- that word is a `facts.status`
 *   (a human decision in Gate 3, phase 9) and not a verification status, so
 *   this enum is where the intent of 5.5 actually lands.
 *
 * The remaining two are not verdicts at all:
 *
 * - **`verified`** -- re-checked and still correct.
 * - **`unverified`** -- *not yet checked*, which is neutral and must not read
 *   as green or as red. Most deterministic `record` evidence sits here
 *   permanently, because Gate 0 only re-verifies citations naming a changed
 *   field; colouring it as a pass would invent a check that never ran.
 *
 * A null status is treated as `unverified`, which is what it means.
 */
export function verificationLabel(status: VerificationStatus | null): {
  tone: BadgeTone
  label: string
  /** Why this state matters. Shown beside the badge, not on hover only. */
  explanation: string
} {
  switch (status) {
    case 'verified':
      return {
        tone: 'ok',
        label: 'Verified',
        explanation: 'Re-checked against the source, which still says this.',
      }
    case 'stale':
      return {
        tone: 'warn',
        label: 'Stale',
        explanation:
          'Was verified, but the deal has had activity more recent than this evidence. Still grounded -- possibly overtaken.',
      }
    case 'span_missing':
      return {
        tone: 'danger',
        label: 'Quote not found',
        explanation:
          'The quoted text is no longer where it was recorded. Nothing currently backs this claim.',
      }
    case 'value_drifted':
      return {
        tone: 'danger',
        label: 'Value changed',
        explanation:
          'The record field this cited now holds a different value, so the claim was true of a state that no longer exists.',
      }
    case 'unverified':
    case null:
    default:
      return {
        tone: 'neutral',
        label: 'Not re-checked',
        explanation:
          'No verification pass has run on this link. That is not a failure -- it means nothing has changed that would require one.',
      }
  }
}

/** True when the source no longer supports the claim. Never true of `stale`. */
export function isBroken(status: VerificationStatus | null): boolean {
  return status === 'span_missing' || status === 'value_drifted'
}

/**
 * What each kind of evidence points at, in a sentence.
 *
 * `derived` is the one worth being careful about: it is an assertion about the
 * *absence* of rows ("no economic buyer has been identified"), which by
 * definition cannot cite one. That is a real and defensible form of evidence,
 * and labelling it as such is the honest alternative to either hiding it or
 * dressing it up as a quote.
 */
export const SOURCE_KIND_LABELS: Record<SourceKind, { label: string; explanation: string }> = {
  document: {
    label: 'Document',
    explanation: 'An exact span of a transcript, email or contract.',
  },
  record: {
    label: 'Record',
    explanation:
      'A field in this system’s own database. Most risk detection reasons over structured state rather than over quotes.',
  },
  derived: {
    label: 'Derived',
    explanation:
      'An assertion about the absence of records, which cannot cite one. The reasoning is the evidence.',
  },
}
