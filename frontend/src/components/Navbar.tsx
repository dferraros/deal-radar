import { NavLink } from "react-router-dom";

const mainLinks = [
  { to: "/", label: "Deal Feed" },
  { to: "/heatmap", label: "Heatmap" },
  { to: "/trends", label: "Trends" },
  { to: "/watchlist", label: "Watchlist" },
];

export default function Navbar() {
  return (
    <nav className="bg-gray-900 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <span className="text-amber-400 font-bold text-lg tracking-tight">
            Deal Radar
          </span>
          <div className="flex items-center gap-1">
            {mainLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-amber-400 text-gray-900"
                      : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
            <span className="w-px h-5 bg-gray-700 mx-2" aria-hidden="true" />
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  isActive
                    ? "text-gray-200 bg-gray-800"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                }`
              }
            >
              Admin
            </NavLink>
          </div>
        </div>
      </div>
    </nav>
  );
}
