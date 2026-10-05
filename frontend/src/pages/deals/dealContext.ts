import { createContext, useContext } from 'react'
import type { DealDetail } from '../../lib/types'

/**
 * The deal the workspace is scoped to, shared downward.
 *
 * This is the whole reason `/deals/:dealId` is a layout route (task 3.1):
 * seven tabs need the same record, and seven tabs each calling `useQuery`
 * would be seven cache entries of one row. Context rather than `Outlet`
 * context so a panel three levels down can read it without every component
 * in between forwarding a prop.
 *
 * In its own module so `DealLayout.tsx` exports only its component.
 */
export const DealContext = createContext<DealDetail | null>(null)

/** The deal in scope. Throws outside the workspace, which is the bug. */
export function useDeal(): DealDetail {
  const deal = useContext(DealContext)
  if (!deal) throw new Error('useDeal must be used inside the deal workspace')
  return deal
}
