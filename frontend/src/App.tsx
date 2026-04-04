import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import DealFeed from './views/DealFeed'
import Heatmap from './views/Heatmap'
import Trends from './views/Trends'
import Watchlist from './views/Watchlist'
import CompanyProfile from './views/CompanyProfile'
import Admin from './views/Admin'
import InvestorLeaderboard from './views/InvestorLeaderboard'
import Alerts from './views/Alerts'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DealFeed />} />
        <Route path="/heatmap" element={<Heatmap />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/investors" element={<InvestorLeaderboard />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/company/:id" element={<CompanyProfile />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
    </Routes>
  )
}
