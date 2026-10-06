import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './markdown.css'

export interface MarkdownProps {
  children: string
}

/**
 * Render model output as the markdown it already is.
 *
 * The assistant emits headings, lists, bold and the occasional table; before
 * this it was dropped into a `<p>` with `white-space: pre-wrap`, so a reader
 * saw the raw `**` and `|---|` instead of structure.
 *
 * **Not an AI SDK.** Those manage streaming and chat state -- `useChat`, message
 * arrays, tool calls -- and render nothing. Our transport is already a working
 * hand-rolled SSE reader (`lib/chatStream.ts`) against a custom event shape, so
 * adopting one would mean changing the backend's protocol or writing an adapter,
 * for no rendering benefit. Markdown is a separate, much smaller concern.
 *
 * **Raw HTML is deliberately not rendered.** `react-markdown` escapes it by
 * default and `rehype-raw` is pointedly absent: this text comes from a model
 * that has just read a customer's transcript, so a `<script>` or an `<img
 * onerror=...>` reaching the DOM is a real path and not a theoretical one. The
 * cost is that genuine inline HTML renders as text, which is the right trade.
 */
export function Markdown({ children }: MarkdownProps) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Model output occasionally cites a URL. Open it away from the app,
          // and never hand it a window reference.
          a: ({ href, children: text }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {text}
            </a>
          ),
          // A fenced block gets a scroll container rather than widening the
          // bubble, which would push the whole thread sideways.
          pre: ({ children: code }) => <pre className="md__pre">{code}</pre>,
          table: ({ children: rows }) => (
            <div className="md__table-scroll">
              <table>{rows}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
