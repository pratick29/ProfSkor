import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { motion } from "framer-motion";
import Loading from "../components/Loading";
import { toast } from "../utils/toast";

export default function Search() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [searchType, setSearchType] = useState("link"); // 'link' or 'id'
  const [searchValue, setSearchValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  // Check if there's a profile ID in URL
  const profileId = searchParams.get("id");
  
  useEffect(() => {
    if (profileId) {
      setSearchType("id");
      setSearchValue(profileId);
      handleSearch("id", profileId);
    }
  }, [profileId]);

  async function handleSearch(type = searchType, value = searchValue) {
    if (!value.trim()) {
      setError("Please enter a search value");
      return;
    }

    setLoading(true);
    setError(null);
    setProfile(null);

    try {
      // Accept a full share link (…/search?id=<uuid>, older …/profile/<uuid>) or a bare ID
      const raw = value.trim();
      let profileId = raw;
      if (type !== "id") {
        if (raw.includes("id=")) profileId = raw.split("id=")[1].split("&")[0];
        else if (raw.includes("/profile/")) profileId = raw.split("/profile/")[1].split(/[?#/]/)[0];
      }
      const res = await api.get(`/profiles/shared/${encodeURIComponent(profileId)}`);
      setProfile(res.data);
    } catch (err) {
      console.error("Search error:", err);
      setError(err.message || "Failed to search profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card text-center"
      >
        <h2 className="text-3xl font-bold">🔍 Search Profiles</h2>
        <p className="text-slate-400 mt-2">
          Find profiles by shared link or candidate ID
        </p>
      </motion.div>

      {/* SEARCH FORM */}
      <div className="card space-y-4">
        {/* Search Type Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSearchType("link");
              setSearchValue("");
              setError(null);
            }}
            className={`flex-1 px-4 py-2 rounded-lg font-semibold transition ${
              searchType === "link"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            🔗 Shared Link
          </button>
          <button
            onClick={() => {
              setSearchType("id");
              setSearchValue("");
              setError(null);
            }}
            className={`flex-1 px-4 py-2 rounded-lg font-semibold transition ${
              searchType === "id"
                ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            🆔 Candidate ID
          </button>
        </div>

        {/* Search Input */}
        <div className="flex gap-3">
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            placeholder={
              searchType === "link"
                ? "Paste shared profile link here..."
                : "Enter candidate profile ID..."
            }
            className="input flex-1"
          />
          <button
            onClick={() => handleSearch()}
            disabled={loading}
            className="bg-teal-500 hover:bg-teal-400 text-white disabled:opacity-50 px-6 py-2 rounded-xl font-semibold"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>

      {loading && <Loading message="Searching for profile..." />}

      {/* PROFILE RESULTS */}
      {profile && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="card">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-2xl font-bold">{profile.profile_name || "Profile"}</h3>
                <p className="text-slate-400 mt-1">
                  {new Date(profile.created_at).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/search?id=${profile.id}`);
                  toast.success("Link copied!");
                }}
                className="px-4 py-2 bg-teal-500/20 hover:bg-teal-500/30 rounded-lg"
              >
                🔗 Copy Link
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Profile Type</p>
                <p className="text-lg font-bold mt-1 capitalize">{profile.profile_type}</p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Score</p>
                <p className="text-lg font-bold mt-1 text-teal-400">
                  {profile.profile_data?.score || profile.profile_data?.scores?.overall || "N/A"}/100
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <p className="text-slate-400 text-sm">Profile ID</p>
                <p className="text-xs font-mono mt-1 break-all">{profile.id}</p>
              </div>
            </div>
          </div>

          {/* PROFILE DETAILS */}
          <div className="card">
            <h3 className="font-semibold mb-4">Profile Details</h3>
            <div className="space-y-4">
              {profile.profile_type === "github" && (
                <>
                  <DetailRow label="Username" value={profile.profile_data?.username} />
                  <DetailRow label="Repositories" value={profile.profile_data?.highlights?.length} />
                  <DetailRow label="Total Stars" value={profile.profile_data?.additional_stats?.total_stars} />
                </>
              )}
              {profile.profile_type === "leetcode" && (
                <>
                  <DetailRow label="Username" value={profile.profile_data?.username} />
                  <DetailRow label="Total Solved" value={profile.profile_data?.meta?.total} />
                  <DetailRow label="Current Streak" value={profile.profile_data?.meta?.current_streak} />
                </>
              )}
              {profile.profile_type === "linkedin" && (
                <>
                  <DetailRow label="Has Headline" value={profile.profile_data?.form?.has_headline ? "Yes" : "No"} />
                  <DetailRow label="Has About" value={profile.profile_data?.form?.has_about ? "Yes" : "No"} />
                  <DetailRow label="Posting Frequency" value={profile.profile_data?.form?.posting} />
                </>
              )}
              {profile.profile_type === "fullscore" && (
                <>
                  <DetailRow label="GitHub Score" value={profile.profile_data?.scores?.github} />
                  <DetailRow label="LeetCode Score" value={profile.profile_data?.scores?.leetcode} />
                  <DetailRow label="LinkedIn Score" value={profile.profile_data?.scores?.linkedin} />
                  <DetailRow label="Overall Score" value={profile.profile_data?.scores?.overall} />
                </>
              )}
            </div>
          </div>

          {/* ACTIONS */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (profile.profile_type === "github") navigate("/github");
                else if (profile.profile_type === "leetcode") navigate("/leetcode");
                else if (profile.profile_type === "linkedin") navigate("/linkedin");
                else navigate("/full");
              }}
              className="flex-1 bg-teal-500 hover:bg-teal-400 text-white px-6 py-3 rounded-xl font-semibold"
            >
              View Similar Analysis
            </button>
            <button
              onClick={() => {
                setProfile(null);
                setSearchValue("");
                setError(null);
              }}
              className="px-6 py-3 bg-slate-600 hover:bg-slate-700 rounded-xl font-semibold"
            >
              New Search
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/10">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold">{value || "N/A"}</span>
    </div>
  );
}
