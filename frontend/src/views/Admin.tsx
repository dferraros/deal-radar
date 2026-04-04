import { useEffect, useState } from "react";
import {
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Badge,
  Card,
  Title,
  Text,
} from "@tremor/react";

interface IngestionRun {
  id: string;
  source: string | null;
  status: string | null;
  deals_found: number | null;
  deals_added: number | null;
  run_at: string | null;
  error_log: string | null;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge color="gray">unknown</Badge>;
  if (status === "success") return <Badge color="green">success</Badge>;
  if (status === "failed") return <Badge color="red">failed</Badge>;
  if (status === "partial") return <Badge color="yellow">partial</Badge>;
  return <Badge color="gray">{status}</Badge>;
}

function formatRunAt(runAt: string | null): string {
  if (!runAt) return "—";
  const d = new Date(runAt);
  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default function Admin() {
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/runs?limit=50")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: IngestionRun[]) => {
        setRuns(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        Loading run history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-950 border border-red-800 text-red-300 px-4 py-3 text-sm">
        Failed to load ingestion runs: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Title className="text-gray-100">Ingestion Run Log</Title>
        <Text className="text-gray-400 mt-1">
          Last {runs.length} ingestion pipeline runs — newest first.
        </Text>
      </div>

      {runs.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800">
          <Text className="text-gray-400 text-center py-8">
            No ingestion runs yet. Trigger a run via POST /api/ingest/run.
          </Text>
        </Card>
      ) : (
        <Card className="bg-gray-900 border-gray-800 p-0 overflow-hidden">
          <Table>
            <TableHead>
              <TableRow className="border-b border-gray-800">
                <TableHeaderCell className="text-gray-400 font-bold">Run Time</TableHeaderCell>
                <TableHeaderCell className="text-gray-400 font-bold">Source</TableHeaderCell>
                <TableHeaderCell className="text-gray-400 font-bold">Status</TableHeaderCell>
                <TableHeaderCell className="text-gray-400 font-bold text-right">Found</TableHeaderCell>
                <TableHeaderCell className="text-gray-400 font-bold text-right">Added</TableHeaderCell>
                <TableHeaderCell className="text-gray-400 font-bold">Error</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((run) => (
                <TableRow
                  key={run.id}
                  className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
                >
                  <TableCell className="text-gray-300 text-sm whitespace-nowrap">
                    {formatRunAt(run.run_at)}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs bg-gray-800 text-amber-300 px-2 py-0.5 rounded">
                      {run.source ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell className="text-gray-300 text-sm text-right">
                    {run.deals_found ?? "—"}
                  </TableCell>
                  <TableCell className="text-gray-300 text-sm text-right">
                    {run.deals_added ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {run.error_log ? (
                      <button
                        onClick={() => toggleExpand(run.id)}
                        className="text-left text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        {expanded.has(run.id)
                          ? run.error_log
                          : run.error_log.slice(0, 60) + (run.error_log.length > 60 ? "…" : "")}
                      </button>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
