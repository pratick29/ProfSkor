import { useState } from "react";
import { api } from "../api/client";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { toast } from "../utils/toast";

/* -------------------------------- */

export default function Compare() {
  const [left, setLeft] = useState({ github: "", leetcode: "" });
  const [right, setRight] = useState({ github: "", leetcode: "" });

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function fetchProfile(p) {
    const [g, l] = await Promise.all([
      api.post("/score/github", { github_username: p.github }),
      api.post("/score/leetcode", { leetcode_username: p.leetcode })
    ]);

    return {
      github: g.data.score,
      leetcode: l.data.score,
      total: g.data.score + l.data.score
    };
  }

  async function handleCompare() {
    if (!left.github || !right.github) {
      toast("Enter GitHub usernames");
      return;
    }

    setLoading(true);
    setData(null);

    try {
      const [a, b] = await Promise.all([
        fetchProfile(left),
        fetchProfile(right)
      ]);

      setData({ left: a, right: b });
    } catch (err) {
      console.log(err);
      toast.error(err.message || "Comparison failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const chartData = data
    ? [
        { name: "GitHub", A: data.left.github, B: data.right.github },
        { name: "LeetCode", A: data.left.leetcode, B: data.right.leetcode }
      ]
    : [];

  const winner =
    data &&
    (data.left.total === data.right.total
      ? "Tie"
      : data.left.total > data.right.total
      ? "Profile A"
      : "Profile B");

  /* -------------------------------- */

  return (
    <div className="space-y-10">

      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl bg-white/5 border border-white/10 p-6"
      >
        <h2 className="text-2xl font-bold">⚔ Compare Profiles</h2>
        <p className="text-slate-400">
          Side-by-side developer skill comparison
        </p>
      </motion.div>

      {/* INPUTS */}
      <div className="grid md:grid-cols-2 gap-6">

        <ProfileCard
          title="Profile A"
          onGithub={v => setLeft({ ...left, github: v })}
          onLeet={v => setLeft({ ...left, leetcode: v })}
        />

        <ProfileCard
          title="Profile B"
          onGithub={v => setRight({ ...right, github: v })}
          onLeet={v => setRight({ ...right, leetcode: v })}
        />

      </div>

      {/* BUTTON */}
      <button
        onClick={handleCompare}
        disabled={loading}
        className="w-full bg-teal-500 hover:bg-teal-400 text-white p-3 rounded-xl font-semibold shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50"
      >
        {loading ? "Comparing..." : "Compare Profiles"}
      </button>

      {/* RESULTS */}
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-8"
        >

          {/* TOTALS */}
          <div className="grid md:grid-cols-2 gap-4">
            <ScoreCard label="Profile A Total" value={data.left.total} />
            <ScoreCard label="Profile B Total" value={data.right.total} />
          </div>

          {/* CHART */}
          <div className="rounded-3xl bg-gradient-to-br from-white/5 to-white/2
                          border border-white/10 p-6 h-72">

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />

                <Bar dataKey="A" fill="#14b8a6" radius={[6,6,0,0]} />
                <Bar dataKey="B" fill="#22c55e" radius={[6,6,0,0]} />

              </BarChart>
            </ResponsiveContainer>

          </div>

          {/* WINNER */}
          <div className="text-center text-2xl font-bold">
            🏆 Winner:
            <span className="ml-2 text-brand">
              {winner}
            </span>
          </div>

        </motion.div>
      )}

    </div>
  );
}

/* -------------------------------- */

function ProfileCard({ title, onGithub, onLeet }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="card"
    >
      <h3 className="font-semibold mb-4">{title}</h3>

      <div className="space-y-3">
        <input
          className="input"
          placeholder="GitHub username"
          onChange={e => onGithub(e.target.value)}
        />

        <input
          className="input"
          placeholder="LeetCode username"
          onChange={e => onLeet(e.target.value)}
        />
      </div>
    </motion.div>
  );
}

function ScoreCard({ label, value }) {
  return (
    <motion.div
      whileHover={{ scale: 1.04 }}
      className="card text-center"
    >
      <p className="text-slate-400 text-sm">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </motion.div>
  );
}
