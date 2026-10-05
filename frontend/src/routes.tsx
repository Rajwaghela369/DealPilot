import { createBrowserRouter, Navigate } from 'react-router'
import { MainLayout } from './components/MainLayout'
import { RouteError } from './components/RouteError'
import { AccountsPage } from './pages/accounts/AccountsPage'
import { AccountDetailPage } from './pages/accounts/AccountDetailPage'
import { PipelinePage } from './pages/deals/PipelinePage'
import { DealLayout } from './pages/deals/DealLayout'
import { DealOverviewPage } from './pages/deals/DealOverviewPage'
import { DocumentsPage } from './pages/deals/DocumentsPage'
import { RisksPage } from './pages/deals/RisksPage'
import { MeetingsPage } from './pages/deals/MeetingsPage'
import { MeetingDetailPage } from './pages/deals/MeetingDetailPage'
import { ComingSoon } from './pages/ComingSoon'

/**
 * The route tree, in one place (task 0.3).
 *
 * `/deals/:dealId` is a **layout route**, which is the whole reason the plan
 * picked a nested router: its seven tabs share one deal header, so the deal is
 * fetched by the layout and the tabs below render without refetching it
 * (phase 3). An index redirect sends the bare deal URL to `overview`.
 *
 * `errorElement` is set per branch rather than once at the root. A thrown
 * render error inside the risks tab should leave the sidebar and the deal
 * header standing and replace only the panel -- a single root boundary would
 * blank the whole window and lose the URL context that says which deal failed.
 *
 * Routes for phases not yet built resolve to `ComingSoon` rather than being
 * absent, so the sub-nav is honest: a tab that 404s inside the app reads as a
 * bug, and a tab missing from the nav hides what the product is going to do.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    errorElement: <RouteError />,
    children: [
      // Phase 12. Last, because every number on it is established by 1-11.
      {
        index: true,
        element: (
          <ComingSoon
            phase="Phase 12"
            title="Dashboard"
            body="Pipeline by stage, deals needing attention, tasks due and AI status. Built last, because every figure on it is client-side arithmetic over the lists phases 1-11 establish."
          />
        ),
      },

      // ------------------------------------------------- Phase 2 and 3
      {
        path: 'deals',
        errorElement: <RouteError />,
        children: [
          { index: true, element: <PipelinePage /> },
          {
            path: ':dealId',
            element: <DealLayout />,
            errorElement: <RouteError />,
            children: [
              { index: true, element: <Navigate to="overview" replace /> },
              { path: 'overview', element: <DealOverviewPage /> },
              // Phase 5's call site. Read-only until phase 6 adds the
              // decision controls -- see the note in `RisksPage`.
              { path: 'risks', element: <RisksPage /> },
              { path: 'meetings', element: <MeetingsPage /> },
              { path: 'meetings/:meetingId', element: <MeetingDetailPage /> },
              {
                path: 'people',
                element: (
                  <ComingSoon
                    phase="Phase 8"
                    title="People"
                    body="Stakeholders, and the roll-up of everyone who has spoken in a meeting but is not tracked yet."
                  />
                ),
              },
              { path: 'documents', element: <DocumentsPage /> },
              {
                path: 'facts',
                element: (
                  <ComingSoon
                    phase="Phase 9"
                    title="Facts"
                    body="What extraction found, and what each fact is grounded in. Read-only over HTTP today: there is no accept/reject endpoint, so this cannot be the review queue the design intends."
                  />
                ),
              },
              {
                path: 'chat',
                element: (
                  <ComingSoon
                    phase="Phase 10"
                    title="Deal assistant"
                    body="Ask questions about this deal and get cited answers, streamed over SSE."
                  />
                ),
              },
            ],
          },
        ],
      },

      // ------------------------------------------------------- Phase 1
      {
        path: 'accounts',
        errorElement: <RouteError />,
        children: [
          { index: true, element: <AccountsPage /> },
          { path: ':accountId', element: <AccountDetailPage /> },
        ],
      },

      // ------------------------------------------------- Phases 11, 10
      {
        path: 'tasks',
        element: (
          <ComingSoon
            phase="Phase 11"
            title="Tasks"
            body="One table of work across the pipeline, including the tasks created by accepting a recommendation."
          />
        ),
      },
      {
        path: 'chat',
        element: (
          <ComingSoon
            phase="Phase 10"
            title="Assistant"
            body="The global assistant, scoped across every deal."
          />
        ),
      },

      // A mistyped URL inside the app. Not an error boundary -- nothing
      // threw, the path simply is not one of ours.
      {
        path: '*',
        element: (
          <ComingSoon
            phase="Not found"
            title="No such page"
            body="That URL does not match any route in this app."
          />
        ),
      },
    ],
  },
])
