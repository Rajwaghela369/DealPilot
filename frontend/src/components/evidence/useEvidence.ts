import { useCallback, useState } from 'react'
import type { EvidenceTarget } from './EvidenceDrawer'

/**
 * Own the drawer's open/closed state from a page.
 *
 * Exists so phases 6, 9 and 10 each write two lines rather than re-deriving
 * the same `useState<EvidenceTarget | null>` -- and, more usefully, so a card
 * only needs `openEvidence({...})` and never has to know the drawer exists.
 *
 *     const { target, openEvidence, closeEvidence } = useEvidence()
 *     ...
 *     <Button onClick={() => openEvidence({ dealId, claimType: 'risk', claimId: risk.id, claimTitle: risk.title })}>
 *       {risk.evidence_count} sources
 *     </Button>
 *     <EvidenceDrawer target={target} onClose={closeEvidence} />
 */
export function useEvidence() {
  const [target, setTarget] = useState<EvidenceTarget | null>(null)

  const openEvidence = useCallback((next: EvidenceTarget) => setTarget(next), [])
  const closeEvidence = useCallback(() => setTarget(null), [])

  return { target, openEvidence, closeEvidence }
}
