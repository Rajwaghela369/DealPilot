import { useState } from 'react'
import type { EvidenceItem } from '../../lib/types'
import { formatDateTime } from '../../lib/format'
import { SOURCE_KIND_LABELS, verificationLabel } from '../../lib/verification'
import { Badge, Button } from '../ui'
import { ChunkQuote } from './ChunkQuote'

export interface EvidenceRowProps {
  item: EvidenceItem
  /** Expanded by default for the first row -- the strongest one. */
  defaultOpen?: boolean
}

/** `{table, id, field}` as something readable. */
function RecordLocation({ item }: { item: EvidenceItem }) {
  const ref = item.record_ref
  if (!ref) return null
  return (
    <p className="evidence__record">
      <code>
        {ref.table ?? 'unknown table'}
        {ref.field ? `.${ref.field}` : ''}
      </code>
      {ref.id && <span className="ui-muted evidence__record-id"> row {ref.id}</span>}
    </p>
  )
}

/**
 * Task 5.2: one `claim_evidence` row -- source kind, span, quote.
 *
 * The three source kinds are genuinely different shapes and are rendered as
 * such rather than forced into one layout:
 *
 * - `document` collapses to the recorded snippet, and expands to the
 *   surrounding chunk with the span highlighted. Expanding is what lets
 *   someone check the quote rather than take it.
 * - `record` shows the field it read and the value it read, which *is* the
 *   whole citation -- there is no text to expand into.
 * - `derived` has no source at all, so it shows the snippet as reasoning and
 *   says plainly that it cites no row.
 *
 * Nothing here renders `confidence`. That is task 5.6: `confidence` is the
 * generator's own guess about its own output, verdicts live in
 * `claim_validations`, and that table is not exposed over HTTP at all -- so
 * there is no verdict to show and a confidence number next to a verification
 * badge would be read as one. `verification_status` is a real machine check
 * and is the only trust signal in this drawer.
 */
export function EvidenceRow({ item, defaultOpen = false }: EvidenceRowProps) {
  const [open, setOpen] = useState(defaultOpen)

  const kind = SOURCE_KIND_LABELS[item.source_kind] ?? {
    label: item.source_kind,
    explanation: '',
  }
  const verification = verificationLabel(item.verification_status)
  const expandable = item.source_kind === 'document' && Boolean(item.chunk_id)

  return (
    <li className="evidence__row">
      <div className="evidence__row-head">
        <Badge tone="neutral" title={kind.explanation}>
          {kind.label}
        </Badge>
        <Badge tone={verification.tone} title={verification.explanation}>
          {verification.label}
        </Badge>
        {item.speaker && <span className="evidence__speaker">{item.speaker}</span>}
        {item.occurred_at && (
          <span className="ui-muted evidence__when">{formatDateTime(item.occurred_at)}</span>
        )}
      </div>

      {/* The explanation is always visible, not a tooltip. The difference
          between "stale" and "quote not found" is the single thing a reader
          of this drawer most needs to understand, and hiding it behind a
          hover would hide it on touch entirely. */}
      <p className="evidence__verification-note">{verification.explanation}</p>

      {item.source_kind === 'record' ? (
        <>
          <RecordLocation item={item} />
          {item.snippet && (
            <p className="evidence__value">
              <span className="ui-muted">value read: </span>
              <code>{item.snippet}</code>
            </p>
          )}
        </>
      ) : item.source_kind === 'derived' ? (
        <>
          {item.snippet && <p className="evidence__derived">{item.snippet}</p>}
          <p className="ui-muted evidence__derived-note">
            This cites no record, because it is an assertion that none exists.
          </p>
        </>
      ) : (
        <>
          {item.snippet && (
            <blockquote className="evidence__snippet">&ldquo;{item.snippet}&rdquo;</blockquote>
          )}
          {expandable && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
                {open ? 'Hide context' : 'Show in context'}
              </Button>
              {open && <ChunkQuote item={item} />}
            </>
          )}
          {!expandable && (
            // `source_kind` is `document` but there is no chunk to resolve,
            // so the quote cannot be checked against anything. Worth saying.
            <p className="ui-muted evidence__derived-note">
              This quote has no chunk reference, so it cannot be located in a source
              document.
            </p>
          )}
        </>
      )}
    </li>
  )
}
