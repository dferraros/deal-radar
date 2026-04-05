import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'

export default function Layout() {
  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar />
      <main className="ml-[220px] flex-1 min-h-screen overflow-auto">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  )
}
