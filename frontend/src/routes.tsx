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
import { PeoplePage } from './pages/deals/PeoplePage'
import { FactsPage } from './pages/deals/FactsPage'
import { TasksPage } from './pages/tasks/TasksPage'
import { ChatPage } from './pages/chat/ChatPage'
import { DealChat } from './pages/chat/DealChat'
import { DashboardPage } from './pages/DashboardPage'
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
 * Every phase is built, so the only remaining `ComingSoon` is the catch-all
 * for a URL that matches nothing. That is not an error boundary: nothing
 * threw, the path simply is not one of ours.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    errorElement: <RouteError />,
    children: [
      // Phase 12. Last, because every number on it is established by 1-11.
      { index: true, element: <DashboardPage /> },

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
              { path: 'people', element: <PeoplePage /> },
              { path: 'documents', element: <DocumentsPage /> },
              { path: 'facts', element: <FactsPage /> },
              { path: 'chat', element: <DealChat /> },
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
      { path: 'tasks', element: <TasksPage /> },
      {
        path: 'chat',
        element: (
          <ChatPage
            title="Assistant"
            subtitle="Ask across every deal. Answers come back with citations."
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
