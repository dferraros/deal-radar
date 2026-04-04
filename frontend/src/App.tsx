import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import DealFeed from "./views/DealFeed";
import Heatmap from "./views/Heatmap";
import CompanyProfile from "./views/CompanyProfile";
import Trends from "./views/Trends";
import Watchlist from "./views/Watchlist";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<DealFeed />} />
          <Route path="/heatmap" element={<Heatmap />} />
          <Route path="/company/:id" element={<CompanyProfile />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/watchlist" element={<Watchlist />} />
        </Routes>
      </main>
    </div>
  );
}
