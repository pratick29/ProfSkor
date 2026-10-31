import { useState } from "react";
import CountUp from "react-countup";
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
  Cell,
} from "recharts";
import { toast } from "../utils/toast";

/* ----------------------------------- */

export default function Leetcode() {
  const { user } = useAuth();
  const { prefs, updateSection } = usePreferences();

  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileName, setProfileName] = useState("");

  /* ---------- Score ---------- */

  async function handleScore() {
    if (!username.trim()) return toast("Enter LeetCode username");

    setLoading(true);
    setData(null);

    try {
      const res = await api.post("/score/leetcode", {
        leetcode_username: username.trim(),
        preferences: prefs,
      });

      if (res.data?.error) {
        toast(res.data.error);
        return;
      }

      setData(res.data);
      setProfileName(`LeetCode - ${res.data.username}`);
    } catch (err) {
      console.log(err);
      toast.error(err.message || "Could not score this profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Save ---------- */

  async function handleSave() {
    if (!data || !user) {
      toast("Please generate a score first and ensure you're logged in");
      return;
    }

    setSaving(true);
    const name = profileName.trim() || `LeetCode - ${data.username} - ${new Date().toLocaleDateString()}`;
    
    const result = await saveProfile(
      user.id,
      "leetcode",
      {
        username: data.username,
        score: data.score,
        breakdown: data.breakdown,
        suggestions: data.suggestions,
        meta: data.meta,
        preferences: prefs.leetcode
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

  /* ---------- Save Pref ---------- */

  function updatePref(key, value) {
    updateSection("leetcode", key, value);
  }

  /* ---------- Charts ---------- */

  const breakdownData =
    data?.breakdown &&
    Object.entries(data.breakdown).map(([k, v]) => ({
      name: k,
      score: v,
    }));

  const diffData = data?.meta
    ? [
        { name: "Easy", value: data.meta.easy },
        { name: "Medium", value: data.meta.medium },
        { name: "Hard", value: data.meta.hard },
      ]
    : [];

  const pieData = data
    ? [
        { name: "Score", value: data.score },
        { name: "Remaining", value: 100 - data.score },
      ]
    : [];

  /* ----------------------------------- */

  return (
    <div className="space-y-12">

      {/* Header */}
      <section className="text-center">
        <h1 className="text-4xl font-extrabold">🧩 LeetCode ProfSkor</h1>
        <p className="text-slate-400 mt-2">
          Measure interview readiness using problem-solving depth
        </p>
      </section>

      {/* Input Card */}
      <section className="card space-y-5">

        <div>
          <label className="text-sm text-slate-300">LeetCode Username</label>
          <div className="flex gap-3 mt-2">
            <input
              className="flex-1 rounded-xl bg-black/40 border border-white/10 p-3 outline-none"
              placeholder="your_username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <button
              onClick={handleScore}
              className="bg-teal-500 hover:bg-teal-400 text-white px-6 rounded-xl font-semibold shadow-lg shadow-teal-500/20 transition-all"
            >
              {loading ? "Scoring..." : "Generate"}
            </button>
          </div>
        </div>

        {/* Advanced Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-teal-400"
        >
          ⚙ Advanced Scoring Controls
        </button>

        {/* Advanced Panel */}
        {showAdvanced && (
          <div className="glass p-5 rounded-xl space-y-4">

            <div className="text-center font-semibold">
              Total Weight:{" "}
              <span
                className={
                  Object.values(prefs.leetcode).reduce((a, b) => a + b, 0) === 100
                    ? "text-green-400"
                    : "text-red-400"
                }
              >
                {Object.values(prefs.leetcode).reduce((a, b) => a + b, 0)}%
              </span>
            </div>

            <WeightControl
              label="Easy Problems"
              value={prefs.leetcode.easy}
              onChange={(v) => updatePref("easy", v)}
              presets={{ Low: 10, Balanced: 15, High: 25 }}
            />

            <WeightControl
              label="Medium Problems"
              value={prefs.leetcode.medium}
              onChange={(v) => updatePref("medium", v)}
              presets={{ Low: 20, Balanced: 35, High: 50 }}
            />

            <WeightControl
              label="Hard Problems"
              value={prefs.leetcode.hard}
              onChange={(v) => updatePref("hard", v)}
              presets={{ Low: 15, Balanced: 25, High: 40 }}
            />

            <WeightControl
              label="Streak"
              value={prefs.leetcode.streak}
              onChange={(v) => updatePref("streak", v)}
              presets={{ Low: 10, Balanced: 20, High: 30 }}
            />

            <WeightControl
              label="Consistency"
              value={prefs.leetcode.consistency}
              onChange={(v) => updatePref("consistency", v)}
              presets={{ Low: 10, Balanced: 15, High: 25 }}
            />

            <div className="pt-4 border-t border-white/10">
              <p className="text-xs text-slate-400 mb-2">
                💡 Tip: For interview prep, prioritize Medium problems. For competitive programming, focus on Hard problems.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const balanced = { easy: 15, medium: 35, hard: 25, streak: 15, consistency: 10 };
                    Object.keys(balanced).forEach(k => updatePref(k, balanced[k]));
                  }}
                  className="text-xs px-3 py-1 bg-teal-500/20 rounded"
                >
                  Reset to Balanced
                </button>
                <button
                  onClick={() => {
                    const interview = { easy: 10, medium: 50, hard: 20, streak: 15, consistency: 5 };
                    Object.keys(interview).forEach(k => updatePref(k, interview[k]));
                  }}
                  className="text-xs px-3 py-1 bg-teal-500/20 rounded"
                >
                  Interview Focus
                </button>
              </div>
            </div>

          </div>
        )}

      </section>

      {/* Results */}
      {data && (
        <>
          {/* Save Button */}
          {user && (
            <section className="card flex items-center gap-4">
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
            </section>
          )}

          {/* Score Cards */}
          <section className="grid md:grid-cols-4 gap-4">
            <Metric title="LeetCode Score" value={data.score} big />
            <Metric title="Total Solved" value={data.meta.total} />
            <Metric title="Current Streak" value={data.meta.current_streak || 0} />
            <Metric title="Ranking" value={data.meta.ranking ? `#${data.meta.ranking.toLocaleString()}` : "N/A"} />
          </section>

          {/* Streak & Stats */}
          <section className="grid md:grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-slate-400 text-sm">Current Streak</p>
              <p className="text-3xl font-bold text-orange-400 mt-1">
                🔥 {data.meta.current_streak || 0} days
              </p>
            </div>
            <div className="card text-center">
              <p className="text-slate-400 text-sm">Total Active Days</p>
              <p className="text-3xl font-bold mt-1">
                {data.meta.total_active_days || 0}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-slate-400 text-sm">Problems by Difficulty</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Easy:</span>
                  <span className="text-green-400">{data.meta.easy || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Medium:</span>
                  <span className="text-teal-400">{data.meta.medium || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Hard:</span>
                  <span className="text-red-400">{data.meta.hard || 0}</span>
                </div>
              </div>
            </div>
          </section>

          {/* LeetCode Heatmap & Question Circle */}
          <section className="grid lg:grid-cols-2 gap-6">
            {/* Heatmap */}
            <div className="card">
              <h3 className="font-semibold mb-4">📅 Activity Heatmap</h3>
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-4">
                  View full profile: <a 
                    href={`https://leetcode.com/u/${data.username}/`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-teal-400 hover:underline"
                  >
                    leetcode.com/u/{data.username}
                  </a>
                </p>
                <div className="text-center text-slate-500">
                  <p className="text-sm">Heatmap visualization</p>
                  <p className="text-xs mt-2">Visit LeetCode profile for detailed activity</p>
                </div>
              </div>
            </div>

            {/* Question Circle */}
            <div className="card">
              <h3 className="font-semibold mb-4">🎯 Solved Problems Circle</h3>
              <div className="flex items-center justify-center h-64">
                <div className="relative w-48 h-48">
                  <svg className="transform -rotate-90 w-48 h-48">
                    <circle
                      cx="96"
                      cy="96"
                      r="80"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="16"
                      fill="none"
                    />
                    <circle
                      cx="96"
                      cy="96"
                      r="80"
                      stroke="#14b8a6"
                      strokeWidth="16"
                      fill="none"
                      strokeDasharray={`${(data.meta.total / 2000) * 502.4} 502.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-3xl font-bold">{data.meta.total || 0}</p>
                    <p className="text-sm text-slate-400">Solved</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center text-sm">
                <div>
                  <p className="text-green-400 font-semibold">{data.meta.easy || 0}</p>
                  <p className="text-slate-400">Easy</p>
                </div>
                <div>
                  <p className="text-teal-400 font-semibold">{data.meta.medium || 0}</p>
                  <p className="text-slate-400">Medium</p>
                </div>
                <div>
                  <p className="text-red-400 font-semibold">{data.meta.hard || 0}</p>
                  <p className="text-slate-400">Hard</p>
                </div>
              </div>
            </div>
          </section>

          {/* Charts */}
          <section className="grid lg:grid-cols-2 gap-6">

            <div className="card">
              <h3 className="font-semibold mb-3">Score Breakdown</h3>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={breakdownData}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="score" fill="#14b8a6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <h3 className="font-semibold mb-3">Overall Meter</h3>
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={pieData}
                      innerRadius={65}
                      outerRadius={90}
                      dataKey="value"
                    >
                      <Cell fill="#14b8a6" />
                      <Cell fill="rgba(255,255,255,0.1)" />
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

          </section>

          {/* Difficulty Distribution */}
          <section className="card">
            <h3 className="font-semibold mb-3">Solved Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={diffData}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Suggestions */}
          <section className="card">
            <h3 className="font-semibold mb-3">Improvement Suggestions</h3>
            <ul className="space-y-2 text-sm">
              {data.suggestions?.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </section>
        </>
      )}

    </div>
  );
}

/* ----------------------------------- */

function Metric({ title, value, big }) {
  return (
    <div className="card text-center">
      <p className="text-slate-400 text-sm">{title}</p>
      <p className={`${big ? "text-4xl" : "text-3xl"} font-extrabold mt-1`}>
        {typeof value === "number" ? <CountUp end={value} duration={1.2} /> : value}
      </p>
    </div>
  );
}
