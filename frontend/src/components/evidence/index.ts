/**
 * Phase 5, in one import.
 *
 * Phases 6, 9 and 10 should reach for `EvidenceDrawer` + `useEvidence` and
 * nothing else; `EvidenceList` is exported for the case where a page wants the
 * citations inline rather than in an overlay.
 */

export { EvidenceDrawer } from './EvidenceDrawer'
export type { EvidenceDrawerProps, EvidenceTarget } from './EvidenceDrawer'
export { EvidenceList } from './EvidenceList'
export type { EvidenceListProps } from './EvidenceList'
export { EvidenceRow } from './EvidenceRow'
export { ChunkQuote } from './ChunkQuote'
export { useEvidence } from './useEvidence'
