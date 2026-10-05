import type { ChatCitation } from '../../lib/types'
import { SOURCE_KIND_LABELS } from '../../lib/verification'
import { Badge, Button } from '../../components/ui'

export interface CitationListProps {
  citations: ChatCitation[]
  onOpen: (citation: ChatCitation) => void
}

/**
 * Task 10.5: the citations under an answer.
 *
 * Every assistant message that asserts something carries these, and they are
 * the reason the answer is worth anything -- the same rule as every other
 * screen: nothing is asserted without a path back to what backs it.
 *
 * The `handle` is shown because the answer text refers to it, so a reader can
 * match a sentence to its source rather than guessing which of four citations
 * supports which claim.
 */
export function CitationList({ citations, onOpen }: CitationListProps) {
  return (
    <div className="chat__citations">
      <span className="chat__citations-label">Sources</span>
      <ul className="chat__citation-list">
        {citations.map((citation) => {
          const kind = SOURCE_KIND_LABELS[citation.source_kind]
          return (
            <li key={citation.handle} className="chat__citation">
              <Badge tone="neutral" title={kind?.explanation}>
                {kind?.label ?? citation.source_kind}
              </Badge>
              <span className="chat__citation-handle">{citation.handle}</span>
              <span className="chat__citation-snippet">{citation.snippet}</span>
              {/* Only a document span can be shown in context -- a `record`
                  citation is already its whole value, and `derived` cites
                  nothing by definition. */}
              {citation.chunk_id && (
                <Button size="sm" variant="ghost" onClick={() => onOpen(citation)}>
                  In context
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
