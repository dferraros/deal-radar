import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="ml-[220px] flex-1 min-h-screen overflow-auto bg-white">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  )
}
