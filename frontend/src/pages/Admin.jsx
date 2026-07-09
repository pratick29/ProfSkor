import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function Admin() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMetrics() {
      try {
        const res = await api.get("/admin/metrics");
        setMetrics(res.data);
      } catch (err) {
        setError(err.message || "Failed to load admin metrics");
      }
    }
    loadMetrics();
  }, []);

  if (error) {
    return <div className="card text-red-300">{error}</div>;
  }

  if (!metrics) {
    return <div className="card">Loading admin dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-2xl font-bold">Admin Dashboard</h2>
        <p className="text-slate-400 mt-1">System usage metrics and activity overview.</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Scores" value={metrics.scores_total} />
        <MetricCard label="Saved Profiles" value={metrics.profiles_total} />
        <MetricCard label="GitHub Profiles" value={metrics.profiles_by_type?.github || 0} />
        <MetricCard label="LeetCode Profiles" value={metrics.profiles_by_type?.leetcode || 0} />
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="card">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
  );
}
