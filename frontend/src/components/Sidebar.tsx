import type { ReactElement } from 'react'
import { NavLink } from 'react-router'

interface NavItem {
  to: string
  label: string
  /** Only the dashboard, whose path `/` prefixes every other route. */
  end?: boolean
  icon: ReactElement
}

/**
 * The root pages, in nav order -- which is not build order (phases 1, 2, 3
 * come first on disk and the dashboard is last).
 *
 * Meetings is absent on purpose: it was a root tab before the router landed,
 * but the route map puts meetings inside the deal workspace at
 * `/deals/:dealId/meetings`, because a meeting has no meaning outside its
 * deal. A root-level Meetings tab would need a cross-deal endpoint that does
 * not exist.
 */
const NAV: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    end: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.4" />
        <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.4" />
        <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.4" />
        <rect x="11" y="11" width="6.5" height="6.5" rx="1.4" />
      </svg>
    ),
  },
  {
    to: '/deals',
    label: 'Pipeline',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2.5" y="6" width="15" height="10.5" rx="1.6" />
        <path d="M6.5 6V5a3.5 3.5 0 0 1 7 0v1" />
      </svg>
    ),
  },
  {
    to: '/accounts',
    label: 'Accounts',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 17V5.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1V17" strokeLinejoin="round" />
        <path d="M11 9h5a1 1 0 0 1 1 1v7" strokeLinejoin="round" />
        <path d="M2 17h16M5.5 7.5h3M5.5 10.5h3M5.5 13.5h3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/tasks',
    label: 'Tasks',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M7 4.5h9M7 10h9M7 15.5h9" strokeLinecap="round" />
        <path d="M3 4.5l1.2 1.2L6 3.8M3 10l1.2 1.2L6 9.3M3 15.5l1.2 1.2L6 14.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/chat',
    label: 'Assistant',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M10 2.5 11.6 7 16 8.6 11.6 10.2 10 14.7 8.4 10.2 4 8.6 8.4 7 10 2.5Z" strokeLinejoin="round" />
        <path d="M15.5 13.5 16.2 15.3 18 16 16.2 16.7 15.5 18.5 14.8 16.7 13 16 14.8 15.3 15.5 13.5Z" strokeLinejoin="round" />
      </svg>
    ),
  },
]

/**
 * Task 0.4: `NavLink` per root page, so the active tab comes from the URL
 * rather than from `useState`.
 *
 * That is not a refactor for its own sake -- with state, a deal link inside
 * the pipeline table left "Pipeline" highlighted while the workspace was
 * open, and a reload landed on the dashboard whatever the URL said.
 */
export interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" />
        {!collapsed && <span className="sidebar-brand-name">DealPilot</span>}
        <button
          type="button"
          className="sidebar-collapse"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path
              d={collapsed ? 'M6 4l4 4-4 4' : 'M10 4L6 8l4 4'}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `sidebar-tab${isActive ? ' active' : ''}`}
            // The only affordance left when the label is hidden, so it is not
            // optional in the collapsed state.
            title={collapsed ? item.label : undefined}
          >
            <span className="sidebar-tab-icon">{item.icon}</span>
            {!collapsed && <span className="sidebar-tab-label">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
