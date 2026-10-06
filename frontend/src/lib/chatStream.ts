import { apiFetch, toApiError } from './api'
import { chat } from './queries'
import type { ChatStreamEvent } from './types'

export interface StreamHandlers {
  onDelta: (content: string) => void
  /** A provider failure, arriving **inside an HTTP 200**. */
  onError: (detail: string) => void
  /** Terminal. `message_id` is the persisted assistant message. */
  onDone: (messageId: string) => void
}

/**
 * Consume the chat SSE stream (tasks 10.2, 10.3).
 *
 * `fetch` + `ReadableStream`, not `EventSource`: this is a POST and
 * `EventSource` can only issue GETs. That is the whole reason this file
 * exists rather than three lines in a component.
 *
 * Two things the transport forces, both easy to get wrong:
 *
 * 1. **An error arrives inside a 200.** The HTTP status says only that the
 *    stream opened. Groq returns 503 under load often enough that an `error`
 *    event is the normal path rather than an edge case, so it is a handler
 *    rather than a thrown exception -- a throw would lose the partial answer
 *    already streamed.
 * 2. **Chunk boundaries do not respect frame boundaries.** A `data:` frame can
 *    be split across two reads, and two frames can arrive in one. So bytes are
 *    buffered and only split on the blank line that terminates an SSE frame;
 *    parsing each chunk as a message loses or corrupts text under load, which
 *    is exactly when it matters.
 */
export async function streamMessage(
  sessionId: string,
  content: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await apiFetch(chat.messagesPath(sessionId), {
    method: 'POST',
    body: { content },
    signal,
  })

  // A non-2xx here is a real HTTP failure -- a 404 session, or a 422 on an
  // empty message. Provider failures do not come this way.
  if (!res.ok) throw await toApiError(res)
  if (!res.body) throw new Error('The server returned no stream.')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const handle = (raw: string) => {
    // An SSE frame may carry comments or other fields; only `data:` matters.
    const data = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('')
    if (!data) return

    let event: ChatStreamEvent
    try {
      event = JSON.parse(data) as ChatStreamEvent
    } catch {
      // A frame that is not JSON is not something to crash the thread over.
      return
    }

    if (event.type === 'delta') handlers.onDelta(event.content)
    else if (event.type === 'error') handlers.onError(event.detail)
    else if (event.type === 'done') handlers.onDone(event.message_id)
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Frames are separated by a blank line. Split on both line endings
    // because the separator is not guaranteed to be bare \n over the wire.
    let boundary = buffer.search(/\r?\n\r?\n/)
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.replace(/^[\s\S]*?\r?\n\r?\n/, '')
      handle(frame)
      boundary = buffer.search(/\r?\n\r?\n/)
    }
  }

  // A final frame with no trailing blank line still has to be delivered.
  if (buffer.trim()) handle(buffer)
}
