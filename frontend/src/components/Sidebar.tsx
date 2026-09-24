import type { ReactElement } from 'react'
import type { TabKey } from './tabs'

interface Tab {
  key: TabKey
  label: string
  icon: ReactElement
}

const TABS: Tab[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
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
    key: 'myDeals',
    label: 'My Deals',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2.5" y="6" width="15" height="10.5" rx="1.6" />
        <path d="M6.5 6V5a3.5 3.5 0 0 1 7 0v1" />
      </svg>
    ),
  },
  {
    key: 'meetings',
    label: 'Meetings',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2.5" y="4" width="15" height="13" rx="1.6" />
        <path d="M2.5 8h15M6.5 2.5v3M13.5 2.5v3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: 'aiAssistant',
    label: 'AI Assistant',
    icon: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M10 2.5 11.6 7 16 8.6 11.6 10.2 10 14.7 8.4 10.2 4 8.6 8.4 7 10 2.5Z" strokeLinejoin="round" />
        <path d="M15.5 13.5 16.2 15.3 18 16 16.2 16.7 15.5 18.5 14.8 16.7 13 16 14.8 15.3 15.5 13.5Z" strokeLinejoin="round" />
      </svg>
    ),
  },
]

interface SidebarProps {
  activeTab: TabKey
  onSelectTab: (tab: TabKey) => void
}

export function Sidebar({ activeTab, onSelectTab }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" />
        <span className="sidebar-brand-name">DealPilot</span>
      </div>

      <nav className="sidebar-nav">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`sidebar-tab${tab.key === activeTab ? ' active' : ''}`}
            onClick={() => onSelectTab(tab.key)}
          >
            <span className="sidebar-tab-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
