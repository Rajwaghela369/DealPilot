import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'
import { BootCheck } from './BootCheck'
import './Layout.css'

/**
 * Task 0.4. The `useState<TabKey>` is gone and the content area is an
 * `<Outlet/>`; the sidebar reads the active page from the URL.
 */
export function MainLayout() {
  return (
    <div className="app-shell">
      <Sidebar />

      <main className="app-content">
        <BootCheck />
        <Outlet />
      </main>
    </div>
  )
}
