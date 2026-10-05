import { useQuery } from '@tanstack/react-query'
import { evidence, keys } from '../../lib/queries'
import type { ClaimType } from '../../lib/types'
import { Drawer, ErrorState, LoadingBlock } from '../ui'
import { EvidenceList } from './EvidenceList'
import './evidence.css'

export interface EvidenceTarget {
  dealId: string
  claimType: ClaimType
  claimId: string
  /** The claim's own title, so the drawer says what it is answering for. */
  claimTitle: string
}

export interface EvidenceDrawerProps {
  target: EvidenceTarget | null
  onClose: () => void
}

/**
 * Phase 5. The component that answers "why does the system believe this?".
 *
 * The plan calls this the single most important component in the app, and the
 * reason is the thesis: *nothing the system asserts about a deal may exist
 * without a link back to the record or the transcript span that backs it.* A
 * card that can be rendered without a path to its evidence has broken the
 * product, so this lands before the pages that assert anything -- phases 6, 9
 * and 10 all open it rather than each inventing their own.
 *
 * Two endpoints back it today (`/risks/{id}/evidence` and
 * `/recommendations/{id}/evidence`), and `claim_evidence` is polymorphic over
 * five claim types -- so `claimType` is part of the interface even though only
 * two values are reachable now. Facts and chat messages are the other two that
 * matter, and both are planned phases.
 */
export function EvidenceDrawer({ target, onClose }: EvidenceDrawerProps) {
  const list = useQuery({
    queryKey: target
      ? keys.evidence(target.dealId, target.claimType, target.claimId)
      : ['evidence', 'idle'],
    queryFn: () => evidence.forClaim(target!.dealId, target!.claimType, target!.claimId),
    enabled: target !== null,
  })

  if (!target) return null

  return (
    <Drawer
      open
      onClose={onClose}
      title="Evidence"
      description={target.claimTitle}
    >
      {list.isPending ? (
        <LoadingBlock label="Loading evidence..." />
      ) : list.isError ? (
        <ErrorState
          error={list.error}
          onRetry={list.refetch}
          title="The evidence could not be loaded"
        />
      ) : (
        <EvidenceList items={list.data} />
      )}
    </Drawer>
  )
}
