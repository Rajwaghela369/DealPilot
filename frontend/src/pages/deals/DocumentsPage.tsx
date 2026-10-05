import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documents, keys } from '../../lib/queries'
import { DOCUMENT_SOURCE_TYPES } from '../../lib/types'
import type { DocumentFilters, DocumentListItem, DocumentSort } from '../../lib/types'
import { formatBytes, formatDate, formatRelative, humanise } from '../../lib/format'
import type { Column } from '../../components/ui'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  RowActions,
  SelectField,
  Table,
  errorMessage,
  useToast,
} from '../../components/ui'
import { useDeal } from './dealContext'
import { DocumentUpload } from './DocumentUpload'
import type { UploadInput } from './DocumentUpload'
import './deals.css'

/**
 * Phase 4: documents.
 *
 * Upstream of the interesting screens -- everything the AI layer says is
 * ultimately grounded in `document_chunks`, so a deal with no documents is a
 * deal where phases 5, 6 and 9 have nothing to show.
 */
export function DocumentsPage() {
  const deal = useDeal()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [filters, setFilters] = useState<DocumentFilters>({ sort: '-occurred_at' })
  const [pendingDelete, setPendingDelete] = useState<DocumentListItem | null>(null)

  const list = useQuery({
    queryKey: keys.documents(deal.id, filters),
    // A bare array. This endpoint has no `Page` envelope and rejects
    // `?limit=` outright (plan 4.6, conventions #1 and #2).
    queryFn: () => documents.list(deal.id, filters),
  })

  /**
   * A document changes more than its own list.
   *
   * Uploading touches `last_activity_at` and bumps the deal's `documents`
   * count in the header; a transcript additionally marks the deal dirty, so
   * the analysis badge is stale too. Deleting clears citation links, which
   * can leave a risk uncited. `['deals', dealId]` is the shallowest prefix
   * that covers all of it.
   */
  const invalidateDeal = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.deal(deal.id) }),
      queryClient.invalidateQueries({ queryKey: keys.documents(deal.id) }),
      queryClient.invalidateQueries({ queryKey: keys.dealAnalysis(deal.id) }),
    ])

  const upload = useMutation({
    mutationFn: (input: UploadInput) => documents.upload(deal.id, input),
    onSuccess: async ({ document, duplicate }) => {
      await invalidateDeal()
      // 200 means `UNIQUE(content_hash)` matched and nothing new was stored.
      // Reporting it as an upload would claim a second copy exists.
      if (duplicate) {
        toast.success(
          `That file is already stored as "${document.title}" -- nothing was duplicated.`,
        )
      } else {
        toast.success(
          `Stored "${document.title}" as ${document.chunk_count} chunk${document.chunk_count === 1 ? '' : 's'}.`,
        )
      }
    },
    // No toast on failure: the refusals carry a next step and belong beside
    // the file picker, which is where `DocumentUpload` renders them (4.2).
  })

  const remove = useMutation({
    mutationFn: (documentId: string) => documents.remove(documentId),
    onSuccess: async () => {
      await invalidateDeal()
      setPendingDelete(null)
      toast.success('Document deleted.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  /**
   * Task 4.4: follow the 302.
   *
   * Opened as a plain navigation rather than fetched. The endpoint redirects
   * to a presigned object-storage URL on another origin, valid for fifteen
   * minutes, so letting the browser follow the redirect gets a fresh
   * signature per view, caches nothing, and never reads a cross-origin body.
   * `noopener` because the presigned URL is a credential of sorts -- the new
   * tab has no business holding a handle on this window.
   */
  const openPreview = (documentId: string) => {
    window.open(documents.previewPath(documentId), '_blank', 'noopener,noreferrer')
  }

  const columns: Column<DocumentListItem>[] = [
    {
      key: 'title',
      header: 'Document',
      render: (row) => (
        <div>
          <div className="deal-cell__name">{row.title}</div>
          {row.original_filename && row.original_filename !== row.title && (
            <div className="deal-cell__sub">{row.original_filename}</div>
          )}
        </div>
      ),
    },
    {
      key: 'source_type',
      header: 'Type',
      render: (row) => (
        <Badge tone={row.source_type === 'meeting_transcript' ? 'accent' : 'neutral'}>
          {humanise(row.source_type)}
        </Badge>
      ),
    },
    {
      key: 'occurred_at',
      header: 'Occurred',
      render: (row) => (
        <div>
          <div>{formatDate(row.occurred_at)}</div>
          <div className="deal-cell__sub">uploaded {formatRelative(row.uploaded_at)}</div>
        </div>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      numeric: true,
      render: (row) => formatBytes(row.byte_size),
    },
    {
      key: 'chunks',
      header: 'Chunks',
      numeric: true,
      // Task 4.3. The count is the point: a document with zero chunks can
      // carry no citation, so it is present in this list and invisible to
      // every part of the product that matters. The API refuses to create
      // one, so a zero here means something has gone wrong since.
      render: (row) =>
        row.chunk_count > 0 ? (
          row.chunk_count
        ) : (
          <Badge tone="danger" title="A document with no chunks cannot back any citation.">
            none
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: <span className="ui-sr-only">Actions</span>,
      numeric: true,
      render: (row) => (
        <RowActions>
          <Button size="sm" variant="ghost" onClick={() => openPreview(row.id)}>
            Preview
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(row)}>
            Delete
          </Button>
        </RowActions>
      ),
    },
  ]

  const filtered = Boolean(filters.source_type?.length)

  return (
    <div className="ui-stack">
      <DocumentUpload
        busy={upload.isPending}
        error={upload.error}
        onUpload={(input) => {
          upload.reset()
          upload.mutate(input)
        }}
      />

      <Card
        title="Documents"
        description={
          list.data
            ? `${list.data.length} document${list.data.length === 1 ? '' : 's'}, ${list.data.reduce((sum, d) => sum + d.chunk_count, 0)} citable chunks.`
            : undefined
        }
        actions={
          <div className="documents__filters">
            <SelectField
              label={<span className="ui-sr-only">Source type</span>}
              value={filters.source_type?.[0] ?? ''}
              onChange={(event) => {
                const value = event.target.value
                setFilters((current) => ({
                  ...current,
                  source_type: value ? [value as (typeof DOCUMENT_SOURCE_TYPES)[number]] : [],
                }))
              }}
            >
              <option value="">All types</option>
              {DOCUMENT_SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {humanise(type)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={<span className="ui-sr-only">Sort</span>}
              value={filters.sort ?? '-occurred_at'}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  sort: event.target.value as DocumentSort,
                }))
              }
            >
              <option value="-occurred_at">Newest conversation</option>
              <option value="occurred_at">Oldest conversation</option>
              <option value="-uploaded_at">Recently uploaded</option>
              <option value="title">Title (A-Z)</option>
            </SelectField>
          </div>
        }
        flush
      >
        {list.isPending ? (
          <LoadingBlock label="Loading documents..." />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <Table
            columns={columns}
            rows={list.data}
            rowKey={(row) => row.id}
            empty={
              filtered ? (
                <EmptyState
                  title="No documents of that type"
                  body="This deal has documents, but none with the selected source type."
                  actions={
                    <Button
                      size="sm"
                      onClick={() => setFilters((current) => ({ ...current, source_type: [] }))}
                    >
                      Show all types
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  title="No documents yet"
                  body="Nothing is grounded until something is uploaded. A meeting transcript is the usual first one -- it is what makes a meeting analysable and what extraction reads."
                />
              )
            }
          />
        )}
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete "${pendingDelete?.title ?? 'document'}"?`}
        confirmLabel="Delete document"
        busy={remove.isPending}
        error={remove.error ? errorMessage(remove.error) : undefined}
        body={
          <>
            <p>
              This deletes the row, its {pendingDelete?.chunk_count ?? 0} chunk
              {pendingDelete?.chunk_count === 1 ? '' : 's'} and the stored file.
            </p>
            {/* The consequence worth stating: claims survive their evidence.
                That is deliberate -- a risk whose quote was deleted is an
                *uncited* risk, which Gate 0 flags, not a risk that never
                happened. But it does mean deleting a transcript can leave
                assertions on the Risks tab with nothing behind them. */}
            <p style={{ marginTop: 'var(--space-3)' }}>
              Any citation pointing at those chunks is cleared, but the{' '}
              <strong>claims themselves survive</strong> -- a risk whose quote is gone
              becomes an uncited risk rather than disappearing. If a meeting used this as
              its transcript, it silently loses that link.
            </p>
          </>
        }
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onCancel={() => {
          setPendingDelete(null)
          remove.reset()
        }}
      />

      <p className="ui-muted documents__note">
        Re-uploading a file that is already stored is harmless: <code>documents</code>{' '}
        carries a uniqueness constraint on the file's hash, so it answers with the
        existing document instead of making a second copy.
      </p>
    </div>
  )
}
