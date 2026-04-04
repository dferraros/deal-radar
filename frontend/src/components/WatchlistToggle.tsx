import { useState } from "react";
import { Button } from "@tremor/react";
import axios from "axios";

interface WatchlistToggleProps {
  companyId: string;
  initialState: boolean;
  onToggle?: (newState: boolean) => void;
}

const StarOutline = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
    />
  </svg>
);

const StarFilled = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 text-amber-400"
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
);

export default function WatchlistToggle({
  companyId,
  initialState,
  onToggle,
}: WatchlistToggleProps) {
  const [isWatchlisted, setIsWatchlisted] = useState(initialState);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    const next = !isWatchlisted;
    setIsWatchlisted(next); // optimistic
    setLoading(true);
    try {
      if (next) {
        await axios.post("/api/watchlist", { company_id: companyId });
      } else {
        // Need watchlist item ID to DELETE. GET /api/watchlist to find it.
        const res = await axios.get("/api/watchlist");
        const item = res.data.find(
          (w: { company_id: string; id: string }) => w.company_id === companyId
        );
        if (item) await axios.delete(`/api/watchlist/${item.id}`);
      }
      onToggle?.(next);
    } catch {
      setIsWatchlisted(!next); // revert on error
      console.error("Failed to update watchlist");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="secondary"
      disabled={loading}
      onClick={handleToggle}
      className={isWatchlisted ? "border-amber-400/50 text-amber-400" : ""}
      icon={loading ? undefined : isWatchlisted ? StarFilled : StarOutline}
    >
      {loading ? "Saving..." : isWatchlisted ? "On Watchlist" : "Add to Watchlist"}
    </Button>
  );
}
