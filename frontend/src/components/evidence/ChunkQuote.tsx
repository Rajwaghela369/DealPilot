import { useQuery } from '@tanstack/react-query'
import { chunks, documents, keys } from '../../lib/queries'
import type { EvidenceItem } from '../../lib/types'
import { formatDateTime, humanise } from '../../lib/format'
import { Button, ErrorState, Spinner } from '../ui'

export interface ChunkQuoteProps {
  /** The citation to resolve. `chunk_id` must be present. */
  item: EvidenceItem
}

/**
 * Where the quote sits inside the chunk.
 *
 * The offsets are chunk-relative -- verified against the running API, where a
 * span recorded at 103-152 satisfies `content.slice(103, 152) === snippet`
 * exactly. `ChunkDetail.metadata` carries a *different* pair of offsets, into
 * the whole document, and using those here would highlight the wrong stretch.
 *
 * The return value distinguishes three cases, because they mean different
 * things:
 *
 * - `exact`     -- the offsets land on the snippet. Highlight in place.
 * - `moved`     -- the snippet is in the chunk, at a different offset. The
 *                  text is intact and the recorded position drifted, so the
 *                  quote is still trustworthy; highlight where it actually is.
 * - `missing`   -- the snippet is not in the chunk at all. This is what Gate 0
 *                  calls `span_missing`, and it is not a rendering problem to
 *                  paper over: the source no longer says what was recorded.
 */
function locate(content: string, item: EvidenceItem) {
  const { snippet, char_start: start, char_end: end } = item
  if (!snippet) return { kind: 'missing' as const, start: 0, end: 0 }

  if (start !== null && end !== null && content.slice(start, end) === snippet) {
    return { kind: 'exact' as const, start, end }
  }
  const found = content.indexOf(snippet)
  if (found >= 0) {
    return { kind: 'moved' as const, start: found, end: found + snippet.length }
  }
  return { kind: 'missing' as const, start: 0, end: 0 }
}

/**
 * Task 5.3: resolve a chunk id to its text and show the cited span in place.
 *
 * Fetched lazily -- only when a row is expanded -- because a risk can carry
 * several citations into the same long transcript, and the drawer should not
 * pull four chunks of a thousand words each to render four one-line quotes.
 *
 * Showing the surrounding text rather than the snippet alone is the whole
 * value: "my team hasn't signed off" means one thing on its own and another
 * when the next sentence is "until they do, I can't take this to anyone
 * internally". The claim is only as honest as the context it allows you to
 * check.
 */
export function ChunkQuote({ item }: ChunkQuoteProps) {
  const chunkId = item.chunk_id

  const chunk = useQuery({
    queryKey: keys.chunk(chunkId ?? ''),
    queryFn: () => chunks.get(chunkId!),
    enabled: Boolean(chunkId),
    // Chunks are immutable once written -- nothing updates `content` -- so
    // there is no reason to re-fetch one within a session.
    staleTime: Infinity,
  })

  if (!chunkId) return null

  if (chunk.isPending) {
    return (
      <p className="evidence__loading">
        <Spinner size={13} /> Resolving the source...
      </p>
    )
  }

  if (chunk.isError) {
    return <ErrorState error={chunk.error} title="The cited chunk could not be loaded" />
  }

  const { content } = chunk.data
  const span = locate(content, item)

  return (
    <div className="evidence__quote">
      <div className="evidence__quote-meta">
        <span>{chunk.data.document_title}</span>
        <span className="ui-muted">
          {humanise(chunk.data.source_type)} &middot; chunk {chunk.data.chunk_index} &middot;{' '}
          {formatDateTime(chunk.data.occurred_at)}
        </span>
      </div>

      {span.kind === 'missing' ? (
        /* The recorded quote is not in this chunk. Gate 0's `span_missing`,
           and the one case where showing the chunk text as if it backed the
           claim would be the dishonest thing to do -- so the recorded
           snippet is shown as what was *claimed*, clearly separated from
           what the source actually contains. */
        <>
          <div className="ui-callout ui-callout--danger evidence__drift">
            <strong>This quote is no longer in the source.</strong> The text below is what
            the chunk says now; the recorded quote was:
            {item.snippet && <em> &ldquo;{item.snippet}&rdquo;</em>}
          </div>
          <blockquote className="evidence__chunk">{content}</blockquote>
        </>
      ) : (
        <>
          {span.kind === 'moved' && (
            <p className="evidence__drift-note ui-muted">
              The recorded offsets have drifted, but the quote is still present -- shown
              where it actually occurs.
            </p>
          )}
          <blockquote className="evidence__chunk">
            {content.slice(0, span.start)}
            <mark className="evidence__mark">{content.slice(span.start, span.end)}</mark>
            {content.slice(span.end)}
          </blockquote>
        </>
      )}

      {/* Task 5.4. Opens the original file, not this chunk -- the point is to
          let someone check the quote against the document it came from. */}
      <div className="ui-row">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            window.open(
              documents.previewPath(chunk.data.document_id),
              '_blank',
              'noopener,noreferrer',
            )
          }
        >
          Open source document
        </Button>
      </div>
    </div>
  )
}
