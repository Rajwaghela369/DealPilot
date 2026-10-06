import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { ToastProvider } from './components/ui'
import { router } from './routes'
import './index.css'
import './styles/tokens.css'

/**
 * Task 0.5.
 *
 * `staleTime` of 30s is the plan's number, and it suits this backend: nothing
 * here is real-time, and the one thing that genuinely changes behind the UI's
 * back -- the worker writing risks and facts -- is slower than that anyway
 * (it polls every 2s but sweeps each deal at most once per 24h). The pages
 * that need to watch something moving set their own `refetchInterval`
 * instead of lowering this for everyone.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // One retry, not three. This API answers a wrong id with 404 and a bad
      // filter with 422, and neither improves on a second attempt -- retrying
      // them just delays the error message by two backoffs. A 5xx or a dropped
      // connection is worth one go.
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status
        if (typeof status === 'number' && status < 500) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Outside the router, so a toast survives a navigation -- a mutation
          that fails as the user leaves the page still gets to say so. */}
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
