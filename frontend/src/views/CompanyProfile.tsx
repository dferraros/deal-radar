import { useParams } from "react-router-dom";

export default function CompanyProfile() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100 mb-6">Company Profile</h1>
      <p className="text-gray-400 text-sm">
        Company ID: <span className="font-mono text-amber-400">{id}</span>
      </p>
      <p className="text-gray-400 text-sm mt-2">
        Deal history, investors, and watchlist toggle will appear here.
      </p>
    </div>
  );
}
