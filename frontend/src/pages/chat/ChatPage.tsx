import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chat, keys, system } from '../../lib/queries'
import { streamMessage } from '../../lib/chatStream'
import type { ChatCitation, ChatMessage, ChatSession } from '../../lib/types'
import { formatRelative } from '../../lib/format'
import { errorMessage } from '../../lib/errorMessage'
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Spinner,
  useToast,
} from '../../components/ui'
import { ChunkQuote } from '../../components/evidence'
import { PageHeader } from '../../components/PageHeader'
import { CitationList } from './CitationList'
import { citationToEvidence } from './citationToEvidence'
import './chat.css'

export interface ChatPageProps {
  /** Present for `/deals/:dealId/chat`, absent for the global `/chat`. */
  dealId?: string
  title: string
  subtitle: string
}

/**
 * Phase 10: the assistant, mounted twice -- deal-scoped and global.
 *
 * The transport is the interesting part and it is not ordinary. `POST
 * .../messages` returns Server-Sent Events, so `EventSource` is unusable (it
 * can only GET) and the stream is read with `fetch` + `ReadableStream` in
 * `lib/chatStream.ts`.
 *
 * **A provider failure arrives inside an HTTP 200.** The status code says only
 * that the stream opened; the `error` event inside it is what says the answer
 * failed. Groq returns 503 under load often enough that this is the normal
 * path, so an error is rendered in the thread beside whatever text had already
 * streamed, rather than replacing the conversation with a failure screen.
 */
export function ChatPage({ dealId, title, subtitle }: ChatPageProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  // A citation resolves by `chunk_id`, not by claim: `claim_evidence` is keyed
  // on stored claims and a chat answer is not one, so the drawer here wraps
  // `ChunkQuote` directly rather than the claim-based evidence endpoints.
  const [citation, setCitation] = useState<ChatCitation | null>(null)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState<{ content: string; error: string | null } | null>(null)
  const [pendingUser, setPendingUser] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ChatSession | null>(null)
  const [renaming, setRenaming] = useState<ChatSession | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const sessions = useQuery({
    queryKey: keys.chatSessions(),
    queryFn: chat.listSessions,
  })

  const ai = useQuery({
    queryKey: keys.aiStatus(),
    queryFn: system.aiStatus,
    staleTime: 60_000,
  })

  // Only this scope's sessions. A global session has no `deal_id`; a deal
  // session's must match, and the two lists must not bleed into each other.
  const scoped = (sessions.data ?? []).filter((s) =>
    dealId ? s.deal_id === dealId : s.scope === 'global',
  )
  const active = scoped.find((s) => s.id === activeId) ?? null

  const messages = useQuery({
    queryKey: keys.chatMessages(active?.id ?? ''),
    queryFn: () => chat.messages(active!.id),
    enabled: active !== null,
  })

  const createSession = useMutation({
    mutationFn: () =>
      // Task 10.1: the scope rule is encoded in the call, so a mismatch
      // cannot be constructed -- deal scope requires a `deal_id`, global
      // forbids one, and the server answers 422 either way round.
      chat.createSession(dealId ? { scope: 'deal', dealId } : { scope: 'global' }),
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: keys.chatSessions() })
      setActiveId(session.id)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const rename = useMutation({
    mutationFn: ({ id, titleText }: { id: string; titleText: string }) =>
      chat.renameSession(id, titleText),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.chatSessions() })
      setRenaming(null)
      toast.success('Renamed.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const removeSession = useMutation({
    mutationFn: (id: string) => chat.deleteSession(id),
    onSuccess: async (_result, id) => {
      await queryClient.invalidateQueries({ queryKey: keys.chatSessions() })
      if (activeId === id) setActiveId(null)
      setDeleting(null)
      toast.success('Session deleted.')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const aiEnabled = ai.data?.config.enabled !== false

  const send = useCallback(
    async (sessionId: string, content: string) => {
      setPendingUser(content)
      setStreaming({ content: '', error: null })
      setDraft('')

      const controller = new AbortController()
      abortRef.current = controller

      try {
        await streamMessage(
          sessionId,
          content,
          {
            onDelta: (chunk) =>
              setStreaming((current) =>
                current ? { ...current, content: current.content + chunk } : current,
              ),
            // Task 10.3: an error inside a 200. Kept in the bubble so the
            // partial answer above it is not thrown away.
            onError: (detail) =>
              setStreaming((current) => (current ? { ...current, error: detail } : current)),
            // Task 10.4: on `done`, the persisted message is authoritative.
            // Refetching and clearing the optimistic bubble is what reconciles
            // them -- keeping the streamed text would double the answer once
            // the real row arrives.
            onDone: async () => {
              await queryClient.invalidateQueries({
                queryKey: keys.chatMessages(sessionId),
              })
              await queryClient.invalidateQueries({ queryKey: keys.chatSessions() })
              setStreaming(null)
              setPendingUser(null)
            },
          },
          controller.signal,
        )
      } catch (error) {
        // A real HTTP failure, as opposed to an in-stream error event.
        setStreaming((current) =>
          current ? { ...current, error: errorMessage(error) } : { content: '', error: errorMessage(error) },
        )
      } finally {
        abortRef.current = null
      }
    },
    [queryClient],
  )

  const handleSubmit = async () => {
    const content = draft.trim()
    if (!content) return
    let sessionId = active?.id
    if (!sessionId) {
      const session = await createSession.mutateAsync()
      sessionId = session.id
    }
    await send(sessionId, content)
  }

  const busy = streaming !== null

  return (
    <div className="page">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Button variant="primary" onClick={() => createSession.mutate()} loading={createSession.isPending}>
            New conversation
          </Button>
        }
      />

      {!aiEnabled && (
        /* Task 10.7. Unlike the risk detector there is no deterministic
           fallback here, so the composer is disabled rather than letting
           every message fail in the same way. */
        <div className="ui-callout ui-callout--warn">
          <strong>The assistant is unavailable.</strong> The AI layer is disabled, so there
          is nothing to answer a question. Every other screen still works.
        </div>
      )}

      <div className="chat">
        <aside className="chat__sessions">
          {sessions.isPending ? (
            <LoadingBlock label="Loading..." />
          ) : sessions.isError ? (
            <ErrorState error={sessions.error} onRetry={sessions.refetch} />
          ) : scoped.length === 0 ? (
            <p className="ui-muted chat__empty">No conversations yet.</p>
          ) : (
            <ul className="chat__session-list">
              {scoped.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    className={`chat__session${session.id === activeId ? ' is-active' : ''}`}
                    onClick={() => setActiveId(session.id)}
                  >
                    <span className="chat__session-title">
                      {/* Titles are generated from the first exchange, so a
                          brand-new session legitimately has none. */}
                      {session.title ?? 'Untitled conversation'}
                    </span>
                    <span className="chat__session-when">
                      {session.last_message_at
                        ? formatRelative(session.last_message_at)
                        : 'empty'}
                    </span>
                  </button>
                  <div className="chat__session-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRenaming(session)
                        setRenameValue(session.title ?? '')
                      }}
                    >
                      Rename
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(session)}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="chat__thread">
          {active === null ? (
            <EmptyState
              title="Ask a question"
              body={
                dealId
                  ? 'Answers are scoped to this deal and come back with citations you can open.'
                  : 'Answers span every deal, and come back with citations you can open.'
              }
            />
          ) : (
            <>
              <div className="chat__messages">
                {messages.isPending ? (
                  <LoadingBlock label="Loading messages..." />
                ) : messages.isError ? (
                  <ErrorState error={messages.error} onRetry={messages.refetch} />
                ) : (
                  <>
                    {messages.data.map((message) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        onOpenCitation={setCitation}
                      />
                    ))}

                    {/* The optimistic pair, replaced on `done` by the
                        persisted rows. */}
                    {pendingUser && (
                      <div className="chat__bubble is-user">
                        <p className="chat__text">{pendingUser}</p>
                      </div>
                    )}
                    {streaming && (
                      <div className="chat__bubble is-assistant">
                        {streaming.content ? (
                          <p className="chat__text">{streaming.content}</p>
                        ) : (
                          !streaming.error && (
                            <p className="chat__typing">
                              <Spinner size={13} /> Thinking...
                            </p>
                          )
                        )}
                        {streaming.error && (
                          <div className="ui-callout ui-callout--danger chat__error">
                            <strong>The answer failed.</strong> {streaming.error}
                            {streaming.content && (
                              <> The text above is what arrived before it stopped.</>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              <form
                className="chat__composer"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleSubmit()
                }}
              >
                <textarea
                  className="ui-textarea chat__input"
                  value={draft}
                  rows={2}
                  placeholder={
                    aiEnabled ? 'Ask about this deal...' : 'The assistant is unavailable'
                  }
                  disabled={!aiEnabled || busy}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter sends, shift+Enter adds a line -- the convention
                    // every chat UI uses, so breaking it would be surprising.
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSubmit()
                    }
                  }}
                />
                <div className="chat__composer-actions">
                  {busy ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        abortRef.current?.abort()
                        setStreaming(null)
                        setPendingUser(null)
                      }}
                    >
                      Stop
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!aiEnabled || !draft.trim()}
                    >
                      Send
                    </Button>
                  )}
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      {renaming && (
        <ConfirmDialog
          open
          title="Rename conversation"
          confirmLabel="Save"
          busy={rename.isPending}
          body={
            <input
              className="ui-input"
              value={renameValue}
              autoFocus
              maxLength={255}
              onChange={(event) => setRenameValue(event.target.value)}
            />
          }
          onConfirm={() =>
            renameValue.trim() &&
            rename.mutate({ id: renaming.id, titleText: renameValue.trim() })
          }
          onCancel={() => setRenaming(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this conversation?"
        confirmLabel="Delete"
        busy={removeSession.isPending}
        body="The conversation and its messages are deleted. The documents and records it cited are untouched."
        onConfirm={() => deleting && removeSession.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />

      {citation && (
        <Drawer
          open
          onClose={() => setCitation(null)}
          title="Source"
          description={citation.handle}
        >
          <ChunkQuote item={citationToEvidence(citation)} />
        </Drawer>
      )}
    </div>
  )
}

function MessageBubble({
  message,
  onOpenCitation,
}: {
  message: ChatMessage
  onOpenCitation: (citation: ChatCitation) => void
}) {
  const isUser = message.role === 'user'
  return (
    <div className={`chat__bubble is-${isUser ? 'user' : 'assistant'}`}>
      <p className="chat__text">{message.content}</p>
      {!isUser && message.citations.length > 0 && (
        <CitationList citations={message.citations} onOpen={onOpenCitation} />
      )}
      {!isUser && message.status && message.status !== 'complete' && (
        <Badge tone="warn" title="The stored message did not finish cleanly.">
          {message.status}
        </Badge>
      )}
    </div>
  )
}
