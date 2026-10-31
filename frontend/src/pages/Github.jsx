import { useState } from "react";
import CountUp from "react-countup";
import { motion } from "framer-motion";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../hooks/usePreferences";
import WeightControl from "../components/WeightControl";
import { saveProfile } from "../utils/saveProfile";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { toast } from "../utils/toast";

/* ===================================================== */

export default function Github() {
  const { user } = useAuth();
  const { prefs, updateSection } = usePreferences();

  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileName, setProfileName] = useState("");

  if (!prefs?.github) return null;

  /* ===================== SCORE ======================= */

  async function handleScore() {
    if (!username.trim()) return toast("Enter GitHub username");

    setLoading(true);
    setData(null);

    try {
      const res = await api.post("/score/github", {
        github_username: username.trim(),
        preferences: prefs
      });

      if (res.data?.error) {
        toast(res.data.error);
        return;
      }

      setData(res.data);
      setProfileName(`GitHub - ${res.data.username}`);
    } catch (err) {
      toast.error(err.message || "Could not score this profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ===================== SAVE ======================= */

  async function handleSave() {
    if (!data || !user) {
      toast("Please generate a score first and ensure you're logged in");
      return;
    }

    setSaving(true);
    const name = profileName.trim() || `GitHub - ${data.username} - ${new Date().toLocaleDateString()}`;
    
    const result = await saveProfile(
      user.id,
      "github",
      {
        username: data.username,
        score: data.score,
        breakdown: data.breakdown,
        suggestions: data.suggestions,
        highlights: data.highlights,
        preferences: prefs.github
      },
      name
    );

    if (result.success) {
      toast.success("Profile saved successfully!");
    } else {
      toast.error(`Failed to save: ${result.error}`);
    }
    setSaving(false);
  }

  /* ================= PREF UPDATE ===================== */

  function updatePref(key, value) {
    updateSection("github", key, value);
  }

  /* ===================== DATA ======================== */

  const chartData = data
    ? Object.entries(data.breakdown).map(([k, v]) => ({
        name: k,
        score: v
      }))
    : [];

  const pieData = data
    ? [
        { name: "Score", value: data.score },
        { name: "Remaining", value: 100 - data.score }
      ]
    : [];

  const totalWeight = Object.values(prefs.github).reduce(
    (a, b) => a + b,
    0
  );

  /* ================================================== */

  return (
    <div className="space-y-10">

      {/* ---------------- HEADER ---------------- */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <h2 className="text-2xl font-bold">💻 GitHub ProfSkor</h2>
        <p className="text-slate-400">
          Repositories • Activity • Engineering Quality
        </p>
      </motion.div>

      {/* ---------------- INPUT ---------------- */}
      <div className="card space-y-4">

        <label className="text-sm text-slate-300">
          GitHub Username
        </label>

        <div className="flex gap-3">
          <input
            className="input flex-1"
            placeholder="e.g. torvalds"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />

          <button
            onClick={handleScore}
            className="bg-teal-500 hover:bg-teal-400 text-white px-6 rounded-xl font-semibold shadow-lg shadow-teal-500/20 transition-all"
          >
            {loading ? "Scoring..." : "Generate"}
          </button>
        </div>

        {/* ADVANCED TOGGLE */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-teal-400"
        >
          ⚙ Advanced Weight Settings
        </button>

        {/* ADVANCED PANEL */}
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white/5 rounded-xl p-5 space-y-5"
          >

            <div className="text-center">
              <span
                className={`font-semibold ${
                  totalWeight === 100
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                Total Weight: {totalWeight}%
              </span>
            </div>

            <WeightControl
              label="Repository Volume"
              value={prefs.github.repos}
              onChange={v => updatePref("repos", v)}
              presets={{ Low: 20, Balanced: 30, High: 40 }}
            />

            <WeightControl
              label="Stars Impact"
              value={prefs.github.stars}
              onChange={v => updatePref("stars", v)}
              presets={{ Low: 15, Balanced: 25, High: 35 }}
            />

            <WeightControl
              label="Commit Activity"
              value={prefs.github.commits}
              onChange={v => updatePref("commits", v)}
              presets={{ Low: 20, Balanced: 30, High: 40 }}
            />

            <WeightControl
              label="Consistency"
              value={prefs.github.consistency}
              onChange={v => updatePref("consistency", v)}
              presets={{ Low: 10, Balanced: 15, High: 25 }}
            />

            <div className="pt-4 border-t border-white/10">
              <p className="text-xs text-slate-400 mb-2">
                💡 Tip: Adjust weights based on your role. Backend engineers might value commits more, while open-source contributors might prioritize stars.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const balanced = { repos: 25, stars: 25, commits: 25, consistency: 25 };
                    Object.keys(balanced).forEach(k => updatePref(k, balanced[k]));
                  }}
                  className="text-xs px-3 py-1 bg-teal-500/20 rounded"
                >
                  Reset to Balanced
                </button>
              </div>
            </div>

          </motion.div>
        )}
      </div>

      {/* ---------------- RESULTS ---------------- */}
      {loading && (
        <div className="text-center text-slate-400">
          Analyzing GitHub profile...
        </div>
      )}

      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-8"
        >
          {/* SAVE BUTTON */}
          {user && (
            <div className="card flex items-center gap-4">
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Profile name (optional)"
                className="input flex-1"
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-6 py-2 rounded-xl font-semibold"
              >
                {saving ? "Saving..." : "💾 Save Profile"}
              </button>
            </div>
          )}

          {/* SCORE CARDS */}
          <div className="grid md:grid-cols-4 gap-4">
            <ScoreCard label="GitHub Score" value={data.score} big />
            {Object.entries(data.breakdown).map(([k, v]) => (
              <ScoreCard key={k} label={k} value={v} max={prefs.github?.[k.toLowerCase()] ?? 100} />
            ))}
          </div>

          {/* ADDITIONAL STATS */}
          {data.additional_stats && (
            <div className="card">
              <h3 className="font-semibold mb-4">📊 Profile Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatItem label="Followers" value={data.additional_stats.followers} />
                <StatItem label="Following" value={data.additional_stats.following} />
                <StatItem label="Public Repos" value={data.additional_stats.public_repos} />
                <StatItem label="Public Gists" value={data.additional_stats.public_gists} />
                <StatItem label="Total Stars" value={data.additional_stats.total_stars} />
                <StatItem label="Total Forks" value={data.additional_stats.total_forks} />
                <StatItem label="Top Language" value={data.additional_stats.top_language} />
                <StatItem label="Languages" value={data.additional_stats.languages?.length || 0} />
              </div>
              {(data.additional_stats.bio || data.additional_stats.location || data.additional_stats.company) && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  {data.additional_stats.bio && <p className="text-sm text-slate-300 mb-2">📝 {data.additional_stats.bio}</p>}
                  <div className="flex gap-4 text-sm text-slate-400">
                    {data.additional_stats.location && <span>📍 {data.additional_stats.location}</span>}
                    {data.additional_stats.company && <span>🏢 {data.additional_stats.company}</span>}
                    {data.additional_stats.blog && (
                      <a href={data.additional_stats.blog} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">
                        🔗 Website
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* GITHUB HEATMAP */}
          {data?.username && (
            <div className="card">
              <h3 className="font-semibold mb-4">📅 Contribution Activity</h3>
              <div className="overflow-x-auto">
                <img
                  src={`https://ghchart.rshah.org/14b8a6/${data.username}`}
                  alt="GitHub contribution graph"
                  className="w-full max-w-5xl mx-auto rounded-lg"
                />
              </div>
              <p className="text-xs text-slate-400 mt-2 text-center">
                View full profile: <a href={`https://github.com/${data.username}`} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">github.com/{data.username}</a>
              </p>
            </div>
          )}

          {/* CHARTS */}
          <div className="grid lg:grid-cols-2 gap-6">

            <div className="card">
              <h3 className="font-semibold">📊 Breakdown</h3>
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar
                      dataKey="score"
                      fill="#14b8a6"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h3 className="font-semibold">🎯 Score Meter</h3>
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      innerRadius={65}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      <Cell fill="#14b8a6" />
                      <Cell fill="rgba(255,255,255,0.08)" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <p className="text-center text-sm text-slate-400">
                @{data.username}
              </p>
            </div>

          </div>

          {/* SUGGESTIONS + REPOS */}
          <div className="grid lg:grid-cols-2 gap-6">

            <div className="card">
              <h3 className="font-semibold">✅ Suggestions</h3>
              <ul className="mt-4 space-y-2 text-sm text-slate-300">
                {data.suggestions?.map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h3 className="font-semibold">📁 Repo Highlights</h3>

              <div className="mt-4 space-y-3">
                {data.highlights?.map((r, i) => (
                  <a
                    key={i}
                    href={r.url || `https://github.com/${data.username}/${r.name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white/5 rounded-xl p-4 border border-white/10 hover:bg-white/10 transition"
                  >
                    <div className="flex justify-between">
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-xs text-slate-400">
                        ⭐ {r.stars} • Forks {r.forks}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {r.language || "N/A"} • Updated {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "N/A"}
                    </p>
                  </a>
                ))}
              </div>

            </div>

          </div>

        </motion.div>
      )}

    </div>
  );
}

/* ===================================================== */

function ScoreCard({ label, value, big, max = 100 }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="card text-center"
    >
      <p className="text-slate-400 text-sm">{label}</p>
      <p className={`${big ? "text-4xl" : "text-3xl"} font-bold mt-1`}>
        <CountUp end={Number(value) || 0} duration={1.2} /> /{Math.round(max)}
      </p>
    </motion.div>
  );
}

function StatItem({ label, value }) {
  return (
    <div className="bg-white/5 rounded-lg p-3 text-center">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-lg font-bold mt-1">{value || "N/A"}</p>
    </div>
  );
}
