import { useParams } from 'react-router'
import { ChatPage } from './ChatPage'

/**
 * The deal-scoped assistant.
 *
 * A thin wrapper because `ChatPage` is mounted twice and only this mount has a
 * `dealId`, which comes from the URL rather than from the route table. In its
 * own file so `routes.tsx` exports only the router.
 */
export function DealChat() {
  const { dealId = '' } = useParams()
  return (
    <ChatPage
      dealId={dealId}
      title="Deal assistant"
      subtitle="Answers are scoped to this deal, with citations you can open."
    />
  )
}
