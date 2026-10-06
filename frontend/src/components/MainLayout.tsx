import { Outlet } from 'react-router'
import { useSidebarState } from '../lib/useSidebarState'
import { Sidebar } from './Sidebar'
import { BootCheck } from './BootCheck'
import './Layout.css'

/**
 * Task 0.4. The `useState<TabKey>` is gone and the content area is an
 * `<Outlet/>`; the sidebar reads the active page from the URL.
 */
export function MainLayout() {
  // Owned here rather than inside `Sidebar`, because the shell needs the class
  // too -- the content area's width is the other half of collapsing.
  const { collapsed, toggle } = useSidebarState()

  return (
    <div className={`app-shell${collapsed ? ' is-collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <main className="app-content">
        <BootCheck />
        <Outlet />
      </main>
    </div>
  )
}
