import { useRef, useState } from 'react'
import { ApiError } from '../../lib/api'
import { clearKey } from '../../lib/formState'
import {
  DOCUMENT_SOURCE_TYPES,
  MAX_UPLOAD_BYTES,
  SUPPORTED_UPLOAD_EXTENSIONS,
} from '../../lib/types'
import type { DocumentSourceType } from '../../lib/types'
import { formatBytes, humanise } from '../../lib/format'
import { Button, Card, SelectField, TextField } from '../../components/ui'

export interface UploadInput {
  file: File
  source_type: DocumentSourceType
  title?: string
  occurred_at?: string
}

export interface DocumentUploadProps {
  busy?: boolean
  error?: unknown
  onUpload: (input: UploadInput) => void
}

/**
 * What each source type is for, shown under the select.
 *
 * `meeting_transcript` is called out because it is the one with a behavioural
 * consequence rather than a labelling one: it is what makes a meeting
 * analysable, and uploading it marks the deal dirty so the detector re-runs
 * (plan 7.7). The others only describe the file.
 */
const SOURCE_TYPE_HINTS: Record<DocumentSourceType, string> = {
  meeting_transcript:
    'Makes a meeting analysable, and queues the deal for re-analysis. This is the one that feeds extraction.',
  email: 'Correspondence. Chunked and citable like any other text.',
  proposal: 'What was offered.',
  contract: 'Terms. Citable, but not treated specially.',
  note: 'Anything written by hand.',
}

/**
 * Task 4.1: the upload control.
 *
 * `source_type` is a required form field with no server-side default, so it is
 * a required control here too -- but defaulted to `meeting_transcript` rather
 * than left blank, because it is both the most common upload and the only one
 * with downstream effects. A blank default would make a 422 the likeliest
 * outcome of the most common action.
 *
 * Size is checked before sending. The server answers 413 with a clear message,
 * but uploading 40 MiB to be told it was too big wastes the upload, and the
 * limit exists precisely because ingest is synchronous.
 */
export function DocumentUpload({ busy, error, onUpload }: DocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sourceType, setSourceType] = useState<DocumentSourceType>('meeting_transcript')
  const [title, setTitle] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [problems, setProblems] = useState<Record<string, string>>({})

  const reset = () => {
    setFile(null)
    setTitle('')
    setOccurredAt('')
    setProblems({})
    // The native input keeps its own value, so clearing state is not enough:
    // without this, re-picking the same file fires no `change` event.
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleSubmit = () => {
    const next: Record<string, string> = {}
    if (!file) {
      next.file = 'Choose a file to upload.'
    } else if (file.size > MAX_UPLOAD_BYTES) {
      next.file = `This file is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`
    } else if (file.size === 0) {
      // The server answers 422 "File contains no text to chunk", which is
      // right but arrives after the upload.
      next.file = 'This file is empty, so there would be nothing to chunk.'
    }
    if (Object.keys(next).length) {
      setProblems(next)
      return
    }

    onUpload({
      file: file!,
      source_type: sourceType,
      title: title.trim() || undefined,
      // `occurred_at` is a datetime; a date input gives `YYYY-MM-DD`, which
      // Pydantic accepts and reads as midnight. Sent only when the user set
      // it -- the server defaults to now, and the plan is explicit that a
      // backfilled transcript should always carry its real date.
      occurred_at: occurredAt || undefined,
    })
  }

  /**
   * Task 4.2: render the API's own `detail`.
   *
   * The backend writes actionable messages -- which extensions work, that a
   * `.doc` should be re-saved as `.docx`, that a PDF "looks scanned" and OCR
   * is deliberately unsupported -- and the plan says not to replace them. So
   * this shows `error.message` verbatim and only adds the heading, which is
   * the part the server cannot know: whether the user should pick a different
   * file or fix this one.
   *
   * There are more than the plan's four, found by reading `services/ingest.py`:
   * 413 (too large), 415 x4 (unsupported type, scanned PDF, legacy `.doc`,
   * damaged PDF/docx, non-UTF-8 text), 422 (readable but empty) and 502
   * (object storage unreachable, nothing saved). Grouping by status rather
   * than enumerating each message is what makes that complete instead of
   * nearly complete.
   */
  const refusal = (() => {
    if (!(error instanceof ApiError)) return null
    switch (error.status) {
      case 413:
        return { heading: 'That file is too large', body: error.message }
      case 415:
        return { heading: 'That file cannot be read', body: error.message }
      case 422:
        return { heading: 'Nothing to store', body: error.message }
      case 502:
        return {
          heading: 'The file could not be stored',
          body: `${error.message} Nothing was saved, so retrying is safe.`,
        }
      default:
        // A 5xx is not a refusal -- it is the server breaking, and the body
        // carries no `detail` worth showing. What the user needs to know is
        // the thing the status code does not say: whether the document was
        // stored. Upload is all-or-nothing by design (the transaction spans
        // the object write), so "reload and check the list" is both accurate
        // and the actual next step.
        return error.status >= 500
          ? {
              heading: 'The server failed while handling this upload',
              body:
                'Ingest is all-or-nothing, so the document was most likely not stored -- reload the list to check before retrying. The server log has the detail.',
            }
          : { heading: 'Upload failed', body: error.message }
    }
  })()

  return (
    <Card
      title="Add a document"
      description="Everything the AI layer asserts is grounded in a document chunk, so this is where evidence enters the system."
    >
      <form
        className="ui-stack"
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        {refusal && (
          <div className="ui-callout ui-callout--danger">
            <strong>{refusal.heading}.</strong> {refusal.body}
          </div>
        )}

        <div className="ui-form-grid">
          <div className="ui-span-2">
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="document-file">
                File
              </label>
              <input
                id="document-file"
                ref={inputRef}
                type="file"
                className="ui-input upload__file"
                accept={SUPPORTED_UPLOAD_EXTENSIONS.join(',')}
                aria-invalid={problems.file ? true : undefined}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null)
                  setProblems((current) => clearKey(current, 'file'))
                }}
              />
              <p className="ui-field__hint">
                {SUPPORTED_UPLOAD_EXTENSIONS.join(' ')} &middot; up to{' '}
                {formatBytes(MAX_UPLOAD_BYTES)}. A PDF needs a real text layer -- a
                scanned one is refused, because text recognition is deliberately not
                supported.
              </p>
              {problems.file && <p className="ui-field__error">{problems.file}</p>}
            </div>
          </div>

          <SelectField
            label="Source type"
            value={sourceType}
            hint={SOURCE_TYPE_HINTS[sourceType]}
            onChange={(event) => setSourceType(event.target.value as DocumentSourceType)}
          >
            {DOCUMENT_SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {humanise(type)}
              </option>
            ))}
          </SelectField>

          <TextField
            label="When it happened"
            optional
            type="date"
            value={occurredAt}
            hint="Not when you uploaded it. A June transcript is June, and recency ranking uses this date."
            onChange={(event) => setOccurredAt(event.target.value)}
          />

          <div className="ui-span-2">
            <TextField
              label="Title"
              optional
              value={title}
              placeholder={file?.name ?? 'Defaults to the filename'}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
        </div>

        <div className="ui-row upload__actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!file}>
            Upload
          </Button>
          {file && (
            <>
              <span className="ui-muted upload__filename">
                {file.name} &middot; {formatBytes(file.size)}
              </span>
              <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
                Clear
              </Button>
            </>
          )}
        </div>

        {/* Upload parses the file inside the request -- there is no
            `documents.status` and no 202-and-poll path, on purpose: a
            document row exists only once its text could actually be read.
            So a large PDF genuinely blocks, and saying so beats a spinner
            that looks stuck. */}
        {busy && (
          <p className="ui-muted upload__note">
            Extracting and chunking now. This happens inside the request, so a large PDF
            takes a moment -- a document row is only created once its text has been read.
          </p>
        )}
      </form>
    </Card>
  )
}
