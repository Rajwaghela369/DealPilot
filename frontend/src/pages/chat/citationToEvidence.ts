import type { ChatCitation, EvidenceItem } from '../../lib/types'

/**
 * Adapt a chat citation to the shape the evidence components read.
 *
 * `ChatCitation` and `EvidenceItem` are deliberately different on the wire: a
 * citation has a `handle` (the token the answer text refers to) and no
 * verification state, because Gate 0 verifies *claims* and a chat answer is
 * not a stored claim. So `verification_status` is null here and renders as
 * "not re-checked", which is accurate -- nothing has re-verified this span.
 *
 * In its own module so `CitationList.tsx` exports only its component.
 */
export function citationToEvidence(citation: ChatCitation): EvidenceItem {
  return {
    id: citation.handle,
    source_kind: citation.source_kind,
    snippet: citation.snippet,
    document_id: citation.document_id,
    chunk_id: citation.chunk_id,
    record_ref: citation.record_ref,
    char_start: citation.char_start,
    char_end: citation.char_end,
    speaker: null,
    occurred_at: null,
    relevance: null,
    verification_status: null,
    verified_at: null,
  }
}
