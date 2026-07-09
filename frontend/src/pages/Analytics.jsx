import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";
import { getSavedProfiles } from "../utils/saveProfile";
import { motion } from "framer-motion";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from "recharts";

/* -------------------------------- */

export default function Analytics() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;

  const [activeTab, setActiveTab] = useState("github");
  const [profiles, setProfiles] = useState({
    github: [],
    leetcode: [],
    linkedin: [],
    fullscore: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfiles() {
      setLoading(true);
      const types = ["github", "leetcode", "linkedin", "fullscore"];
      
      const results = await Promise.all(
        types.map(type => getSavedProfiles(user.id, type))
      );

      setProfiles({
        github: results[0].data || [],
        leetcode: results[1].data || [],
        linkedin: results[2].data || [],
        fullscore: results[3].data || []
      });
      
      setLoading(false);
    }

    fetchProfiles();
  }, [user.id]);

  const tabs = [
    { id: "github", label: "GitHub", icon: "💻" },
    { id: "leetcode", label: "LeetCode", icon: "🧩" },
    { id: "linkedin", label: "LinkedIn", icon: "💼" },
    { id: "fullscore", label: "Full Score", icon: "🏆" }
  ];

  const currentProfiles = profiles[activeTab] || [];

  if (loading) {
    return (
      <div className="text-center mt-20 text-slate-400">
        Loading analytics...
      </div>
    );
  }

  if (currentProfiles.length === 0) {
    return (
      <div className="space-y-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-center"
        >
          <h2 className="text-2xl font-bold">📊 ProfSkor Analytics</h2>
        </motion.div>

        {/* TABS */}
        <div className="flex gap-2 bg-white/5 p-2 rounded-xl w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-2 rounded-lg font-semibold transition ${
                activeTab === tab.id
                  ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div className="text-center mt-20 space-y-3">
          <h2 className="text-2xl font-bold">No {activeTab} Data Yet</h2>
          <p className="text-slate-400">
            Save some {activeTab} profiles to see analytics.
          </p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const chartData = currentProfiles
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((profile, i) => {
      const data = profile.profile_data || {};
      const score = data.score || data.scores?.overall || 0;
      return {
        date: new Date(profile.created_at).toLocaleDateString(),
        name: profile.profile_name || `Profile ${i + 1}`,
        score: score,
        ...(activeTab === "github" && {
          repos: data.highlights?.length || 0,
          stars: data.additional_stats?.total_stars || 0
        }),
        ...(activeTab === "leetcode" && {
          total: data.meta?.total || 0,
          streak: data.meta?.current_streak || 0
        }),
        ...(activeTab === "linkedin" && {
          completeness: score
        }),
        ...(activeTab === "fullscore" && {
          github: data.scores?.github || 0,
          leetcode: data.scores?.leetcode || 0,
          linkedin: data.scores?.linkedin || 0
        })
      };
    });

  const best = Math.max(...chartData.map(d => d.score), 0);
  const avg = Math.round(chartData.reduce((a, b) => a + b.score, 0) / chartData.length);
  const trend = chartData.length > 1 
    ? chartData[chartData.length - 1].score - chartData[chartData.length - 2].score 
    : 0;

  return (
    <div className="space-y-10">

      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-between items-center"
      >
        <h2 className="text-2xl font-bold">📊 ProfSkor Analytics</h2>
        <p className="text-slate-400">
          Analysis of your saved {activeTab} profiles
        </p>
      </motion.div>

      {/* TABS */}
      <div className="flex gap-2 bg-white/5 p-2 rounded-xl w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-2 rounded-lg font-semibold transition ${
              activeTab === tab.id
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {tab.icon} {tab.label} ({profiles[tab.id].length})
          </button>
        ))}
      </div>

      {/* STATS */}
      <div className="grid md:grid-cols-4 gap-4">
        <StatCard title="Best Score" value={best} />
        <StatCard title="Average Score" value={avg} />
        <StatCard title="Total Profiles" value={currentProfiles.length} />
        <StatCard
          title="Last Change"
          value={trend >= 0 ? `+${trend}` : trend}
          positive={trend >= 0}
        />
      </div>

      {/* CHARTS */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Score Trend */}
        <div className="card">
          <h3 className="font-semibold mb-4">Score Trend Over Time</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2933" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#14b8a6"
                  strokeWidth={3}
                  dot={{ fill: "#14b8a6", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Profile Distribution */}
        <div className="card">
          <h3 className="font-semibold mb-4">Score Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2933" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="score" fill="#14b8a6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ADDITIONAL CHARTS BASED ON TYPE */}
      {activeTab === "github" && chartData.some(d => d.stars !== undefined) && (
        <div className="card">
          <h3 className="font-semibold mb-4">Stars & Repos Over Time</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2933" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="stars" stroke="#22c55e" strokeWidth={2} />
                <Line type="monotone" dataKey="repos" stroke="#f97316" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === "leetcode" && chartData.some(d => d.total !== undefined) && (
        <div className="card">
          <h3 className="font-semibold mb-4">Problems Solved & Streak</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2933" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#22c55e" strokeWidth={2} />
                <Line type="monotone" dataKey="streak" stroke="#f97316" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === "fullscore" && (
        <div className="card">
          <h3 className="font-semibold mb-4">Platform Breakdown</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2933" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="github" stroke="#22c55e" strokeWidth={2} />
                <Line type="monotone" dataKey="leetcode" stroke="#f97316" strokeWidth={2} />
                <Line type="monotone" dataKey="linkedin" stroke="#0ea5e9" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* PROFILE LIST */}
      <div className="card">
        <h3 className="font-semibold mb-4">All {activeTab} Profiles</h3>
        <div className="space-y-3">
          {currentProfiles.map((profile, i) => {
            const data = profile.profile_data || {};
            const score = data.score || data.scores?.overall || 0;
            return (
              <div key={profile.id} className="bg-white/5 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <p className="font-semibold">{profile.profile_name || `${activeTab} Profile ${i + 1}`}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(profile.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-teal-400">{score}/100</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

/* -------------------------------- */

function StatCard({ title, value, positive }) {
  return (
    <motion.div
      whileHover={{ scale: 1.04 }}
      className="card text-center"
    >
      <p className="text-slate-400 text-sm">{title}</p>
      <p
        className={`text-3xl font-bold mt-1 ${
          positive === undefined
            ? ""
            : positive
            ? "text-green-400"
            : "text-red-400"
        }`}
      >
        {value}
      </p>
    </motion.div>
  );
}
