import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TAB_LABELS, type TabKey } from './tabs'
import './Layout.css'

export function MainLayout() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

      <main className="app-content">
        <div className="app-content-inner">
          <h1>{TAB_LABELS[activeTab]}</h1>
          <p className="app-content-hint">This is the {TAB_LABELS[activeTab]} tab.</p>
        </div>
      </main>
    </div>
  )
}
