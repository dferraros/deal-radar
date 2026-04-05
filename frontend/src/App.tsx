import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import DealFeed from './views/DealFeed'
import Heatmap from './views/Heatmap'
import Trends from './views/Trends'
import Watchlist from './views/Watchlist'
import CompanyProfile from './views/CompanyProfile'
import Admin from './views/Admin'
import InvestorLeaderboard from './views/InvestorLeaderboard'
import InvestorNetwork from './views/InvestorNetwork'
import Alerts from './views/Alerts'
import IntelQueue from './views/IntelQueue'
import IntelDossier from './views/IntelDossier'
import IntelGraph from './views/IntelGraph'
import IntelHeatmap from './views/IntelHeatmap'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DealFeed />} />
        <Route path="/heatmap" element={<Heatmap />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/investors" element={<InvestorLeaderboard />} />
        <Route path="/network" element={<InvestorNetwork />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/company/:id" element={<CompanyProfile />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/intel" element={<IntelQueue />} />
        <Route path="/intel/dossier/:queueId" element={<IntelDossier />} />
        <Route path="/intel/graph" element={<IntelGraph />} />
        <Route path="/intel/heatmap" element={<IntelHeatmap />} />
      </Route>
    </Routes>
  )
}
