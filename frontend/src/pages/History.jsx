import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { getSavedProfiles } from "../utils/saveProfile";
import CountUp from "react-countup";
import { motion } from "framer-motion";
import { toast } from "../utils/toast";

/* --------------------------------------------- */

export default function History() {
  const { user } = useAuth();

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
      <div className="text-center py-20 text-slate-400">
        Loading history...
      </div>
    );
  }

  return (
    <div className="space-y-10">

      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <h2 className="text-2xl font-bold">📈 Profile History</h2>
        <p className="text-slate-400 mt-1">
          View all your saved profiles organized by type
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
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* EMPTY STATE */}
      {currentProfiles.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <p className="text-xl mb-2">No {activeTab} profiles saved yet</p>
          <p className="text-sm">Generate and save a profile to see it here</p>
        </div>
      )}

      {/* PROFILES LIST */}
      <div className="space-y-6">
        {currentProfiles.map((profile, i) => (
          <ProfileCard key={profile.id} profile={profile} index={i} type={activeTab} />
        ))}
      </div>

    </div>
  );
}

/* --------------------------------------------- */

function ProfileCard({ profile, index, type }) {
  const data = profile.profile_data || {};
  const score = data.score || data.scores?.overall || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="card"
    >
      {/* HEADER */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-semibold text-lg">
            {profile.profile_name || `${type} Profile`}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {new Date(profile.created_at).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-teal-400">
            <CountUp end={score} duration={1} /> /100
          </p>
          <p className="text-xs text-slate-400">Score</p>
        </div>
      </div>

      {/* DETAILS */}
      <div className="grid md:grid-cols-3 gap-4 mt-4">
        {type === "github" && (
          <>
            <DetailItem label="Username" value={data.username || "N/A"} />
            <DetailItem label="Repos" value={data.highlights?.length || 0} />
            <DetailItem label="Total Stars" value={data.additional_stats?.total_stars || 0} />
          </>
        )}
        {type === "leetcode" && (
          <>
            <DetailItem label="Username" value={data.username || "N/A"} />
            <DetailItem label="Total Solved" value={data.meta?.total || 0} />
            <DetailItem label="Current Streak" value={data.meta?.current_streak || 0} />
          </>
        )}
        {type === "linkedin" && (
          <>
            <DetailItem label="Headline" value={data.form?.has_headline ? "✅" : "❌"} />
            <DetailItem label="About" value={data.form?.has_about ? "✅" : "❌"} />
            <DetailItem label="Posting" value={data.form?.posting || "N/A"} />
          </>
        )}
        {type === "fullscore" && (
          <>
            <DetailItem label="GitHub" value={data.scores?.github || 0} />
            <DetailItem label="LeetCode" value={data.scores?.leetcode || 0} />
            <DetailItem label="LinkedIn" value={data.scores?.linkedin || 0} />
          </>
        )}
      </div>

      {/* ACTIONS */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-white/10">
        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/profile/${profile.id}`);
            toast.success("Profile link copied!");
          }}
          className="text-sm px-4 py-2 bg-teal-500/20 hover:bg-teal-500/30 rounded-lg"
        >
          🔗 Copy Link
        </button>
        <button
          onClick={() => {
            if (confirm("Delete this profile?")) {
              // TODO: Implement delete
              toast("Delete functionality coming soon");
            }
          }}
          className="text-sm px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg"
        >
          🗑️ Delete
        </button>
      </div>
    </motion.div>
  );
}

function DetailItem({ label, value }) {
  return (
    <div className="bg-white/5 rounded-lg p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-semibold mt-1">{value}</p>
    </div>
  );
}
