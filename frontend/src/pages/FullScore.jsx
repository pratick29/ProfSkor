import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usePreferences } from "../hooks/usePreferences";
import { api } from "../api/client";
import { motion } from "framer-motion";
import Loading from "../components/Loading";
import { saveProfile } from "../utils/saveProfile";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer
} from "recharts";

/* ================================================= */

export default function FullScore() {
  const { user } = useAuth();
  const prefs = usePreferences();
  if (!user) return <Navigate to="/login" />;

  const [github, setGithub] = useState("");
  const [leetcode, setLeetcode] = useState("");
  const [role, setRole] = useState("Backend Engineer");
  const [linkedin, setLinkedin] = useState({
    has_headline: false,
    has_about: false,
    has_projects: false,
    has_photo: false,
    has_experience: false,
    posting: "0 per week"
  });
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [profileName, setProfileName] = useState("");

  /* ---------------- PDF ---------------- */

  async function downloadPDF() {
    if (!data) return;
    
    try {
      const el = document.getElementById("report");
      if (!el) {
        alert("Report content not found");
        return;
      }

      // Show loading message
      const originalText = document.querySelector('button:has-text("📄 Export PDF")')?.textContent;
      
      const canvas = await html2canvas(el, { 
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#0f172a"
      });
      
      const img = canvas.toDataURL("image/png", 1.0);

      const pdf = new jsPDF("p", "mm", "a4");
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;

      // Add title
      pdf.setFontSize(20);
      pdf.text("ProfSkor Report", w / 2, 15, { align: "center" });
      pdf.setFontSize(12);
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, w / 2, 22, { align: "center" });

      pdf.addImage(img, "PNG", 0, 30, w, h);
      pdf.save(`ProfSkor_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error("PDF export error:", error);
      alert("Failed to export PDF. Please try again.");
    }
  }

  /* ---------------- GENERATE FROM API ---------------- */

  async function generate() {
    if (!github.trim() && !leetcode.trim()) {
      setError("Please enter at least GitHub or LeetCode username");
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await api.post("/score", {
        user_id: user.id,
        role: role,
        github_username: github.trim(),
        leetcode_username: leetcode.trim(),
        linkedin: linkedin,
        preferences: prefs || undefined
      });

      if (response.data?.error) {
        setError(response.data.error);
        setLoading(false);
        return;
      }

      const apiData = response.data;

      // Transform API response to match UI expectations
      const transformedData = {
        candidate: {
          id: user.id,
          name: user.email?.split("@")[0] || "User",
          headline: role,
          photo: `https://ui-avatars.com/api/?name=${encodeURIComponent(github || leetcode)}&background=14b8a6&color=fff`
        },

        percentile: Math.round(100 - (apiData.scores.overall / 100) * 20), // Estimate

        history: { previous: apiData.scores.overall - 5 }, // Mock previous

        scores: {
          overall: apiData.scores.overall,
          github: apiData.scores.github,
          leetcode: apiData.scores.leetcode,
          linkedin: apiData.scores.linkedin
        },

        consistency: {
          days_per_week: apiData.leetcode_meta?.streak ? Math.min(apiData.leetcode_meta.streak / 7, 7) : 3,
          active_weeks: apiData.leetcode_meta?.streak ? Math.floor(apiData.leetcode_meta.streak / 7) : 10,
          momentum: apiData.scores.overall > 70 ? "increasing" : "stable"
        },

        summary: generateSummary(apiData),

        strengths: extractStrengths(apiData),
        risks: extractRisks(apiData),
        interview_focus: extractInterviewFocus(apiData),

        verdict: generateVerdict(apiData),

        github: {
          repos: apiData.breakdown?.github?.highlights?.length || 0,
          stars: apiData.breakdown?.github?.highlights?.reduce((sum, r) => sum + (r.stars || 0), 0) || 0,
          weekly_commits: 0, // Not available from API
          calendar: github ? `https://ghchart.rshah.org/14b8a6/${github}` : "",
          top_repos: apiData.breakdown?.github?.highlights || [],
          suggestions: apiData.suggestions?.filter(s => s.includes("GitHub")) || []
        },

        leetcode: {
          total: apiData.leetcode_meta?.total || 0,
          easy: apiData.leetcode_meta?.easy || 0,
          medium: apiData.leetcode_meta?.medium || 0,
          hard: apiData.leetcode_meta?.hard || 0,
          streak: apiData.leetcode_meta?.streak || 0,
          rating: apiData.leetcode_meta?.ranking || 0,
          topics: {} // Not available from API
        },

        skills: generateSkills(apiData),

        languages: generateLanguages(apiData),

        skill_gaps: extractSkillGaps(apiData),

        role_fit: generateRoleFit(apiData, role),

        best_role: role,

        linkedin: {
          completeness: apiData.scores.linkedin,
          headline: linkedin.has_headline,
          about: linkedin.has_about,
          projects: linkedin.has_projects,
          photo: linkedin.has_photo
        }
      };

      setData(transformedData);
      setProfileName(`FullScore - ${github || leetcode || "Profile"} - ${new Date().toLocaleDateString()}`);
    } catch (err) {
      console.error("Error generating score:", err);
      setError(err.response?.data?.error || "Failed to generate score. Please check your inputs and try again.");
    } finally {
      setLoading(false);
    }
  }

  /* ---------------- SAVE ---------------- */

  async function handleSave() {
    if (!data || !user) {
      alert("Please generate a score first and ensure you're logged in");
      return;
    }

    setSaving(true);
    const name = profileName.trim() || `FullScore - ${new Date().toLocaleDateString()}`;
    
    const result = await saveProfile(
      user.id,
      "fullscore",
      {
        github: github,
        leetcode: leetcode,
        linkedin: linkedin,
        role: role,
        scores: data.scores,
        breakdown: data,
        preferences: prefs
      },
      name
    );

    if (result.success) {
      alert("Profile saved successfully!");
    } else {
      alert(`Failed to save: ${result.error}`);
    }
    setSaving(false);
  }

  // Helper functions
  function generateSummary(data) {
    const scores = data.scores;
    if (scores.overall >= 80) {
      return "Excellent profile with strong technical skills and consistent activity across platforms.";
    } else if (scores.overall >= 60) {
      return "Good profile with solid foundations. Focus on consistency and expanding your portfolio.";
    } else {
      return "Profile shows potential. Prioritize regular activity and completing key profile sections.";
    }
  }

  function extractStrengths(data) {
    const strengths = [];
    if (data.scores.github >= 70) strengths.push("Strong GitHub presence");
    if (data.scores.leetcode >= 70) strengths.push("Good problem-solving skills");
    if (data.scores.linkedin >= 70) strengths.push("Complete LinkedIn profile");
    if (data.leetcode_meta?.streak >= 30) strengths.push("Consistent coding practice");
    return strengths.length > 0 ? strengths : ["Building technical foundation"];
  }

  function extractRisks(data) {
    const risks = [];
    if (data.scores.github < 50) risks.push("Limited GitHub activity");
    if (data.scores.leetcode < 50) risks.push("Low LeetCode engagement");
    if (data.scores.linkedin < 50) risks.push("Incomplete LinkedIn profile");
    return risks.length > 0 ? risks : ["Continue building your profile"];
  }

  function extractInterviewFocus(data) {
    const focus = [];
    if (data.scores.github >= data.scores.leetcode) focus.push("System Design", "Code Quality");
    if (data.scores.leetcode >= data.scores.github) focus.push("DSA", "Problem Solving");
    focus.push("Communication");
    return focus;
  }

  function generateVerdict(data) {
    const score = data.scores.overall;
    if (score >= 80) {
      return { decision: "Strong Hire", confidence: score, reason: "Excellent technical profile" };
    } else if (score >= 60) {
      return { decision: "Hire", confidence: score, reason: "Good technical foundation" };
    } else {
      return { decision: "Consider", confidence: score, reason: "Profile needs improvement" };
    }
  }

  function generateSkills(data) {
    return [
      { skill: "DSA", value: data.scores.leetcode },
      { skill: "Code Quality", value: data.scores.github },
      { skill: "Profile", value: data.scores.linkedin },
      { skill: "Overall", value: data.scores.overall }
    ];
  }

  function generateLanguages(data) {
    // Extract from GitHub highlights if available
    const langs = {};
    if (data.breakdown?.github?.highlights) {
      data.breakdown.github.highlights.forEach(r => {
        if (r.language) {
          langs[r.language] = (langs[r.language] || 0) + 1;
        }
      });
    }
    return Object.entries(langs).slice(0, 3).map(([name, count]) => ({
      name,
      value: Math.min(count * 20, 100)
    }));
  }

  function extractSkillGaps(data) {
    const gaps = [];
    if (data.scores.github < 50) gaps.push("GitHub Activity");
    if (data.scores.leetcode < 50) gaps.push("Problem Solving");
    if (data.scores.linkedin < 50) gaps.push("LinkedIn Profile");
    return gaps;
  }

  function generateRoleFit(data, role) {
    const score = data.scores.overall;
    return {
      [role]: score,
      "Full Stack": Math.max(0, score - 10),
      "Other": Math.max(0, score - 15)
    };
  }

  /* ================================================= */

  return (
    <div className="space-y-10 max-w-6xl mx-auto pb-20">

      {/* INPUT */}
      <Card>
        <h2 className="text-3xl font-bold">🏆 Full Talent Intelligence</h2>
        <p className="text-slate-400 mt-2">Get a comprehensive analysis of your professional profile</p>

        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <input 
            className="input" 
            placeholder="GitHub Username (optional)" 
            value={github} 
            onChange={(e) => setGithub(e.target.value)} 
          />
          <input 
            className="input" 
            placeholder="LeetCode Username (optional)" 
            value={leetcode} 
            onChange={(e) => setLeetcode(e.target.value)} 
          />
        </div>

        <div className="mt-4">
          <label className="text-sm text-slate-300 mb-2 block">Target Role</label>
          <select 
            className="input w-full"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option>Backend Engineer</option>
            <option>Frontend Engineer</option>
            <option>Full Stack Engineer</option>
            <option>AI/ML Engineer</option>
            <option>Data Engineer</option>
            <option>DevOps Engineer</option>
          </select>
        </div>

        <div className="mt-4">
          <label className="text-sm text-slate-300 mb-2 block">LinkedIn Profile</label>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={linkedin.has_headline}
                onChange={(e) => setLinkedin({...linkedin, has_headline: e.target.checked})}
              />
              Has Headline
            </label>
            <label className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={linkedin.has_about}
                onChange={(e) => setLinkedin({...linkedin, has_about: e.target.checked})}
              />
              Has About
            </label>
            <label className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={linkedin.has_projects}
                onChange={(e) => setLinkedin({...linkedin, has_projects: e.target.checked})}
              />
              Has Projects
            </label>
            <label className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={linkedin.has_photo}
                onChange={(e) => setLinkedin({...linkedin, has_photo: e.target.checked})}
              />
              Has Photo
            </label>
            <label className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={linkedin.has_experience}
                onChange={(e) => setLinkedin({...linkedin, has_experience: e.target.checked})}
              />
              Has Experience
            </label>
            <select 
              className="input text-sm"
              value={linkedin.posting}
              onChange={(e) => setLinkedin({...linkedin, posting: e.target.value})}
            >
              <option>0 per week</option>
              <option>1 per week</option>
              <option>2-3 per week</option>
              <option>4+ per week</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <button 
          onClick={generate} 
          disabled={loading}
          className="mt-5 bg-teal-500 hover:bg-teal-400 text-white disabled:opacity-50 px-8 py-3 rounded-xl font-semibold shadow-lg shadow-teal-500/20 transition-all"
        >
          {loading ? "Analyzing Profiles..." : "Generate Report"}
        </button>
      </Card>

      {loading && <Loading message="Analyzing your profiles... This may take a moment." />}

      {data && !loading && (
        <>
          <CandidateHeader data={data} />
          <TabBar tab={tab} setTab={setTab} />

          <div className="flex gap-3 items-center">
            {user && (
              <>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Profile name (optional)"
                  className="input flex-1 max-w-xs"
                />
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-lg font-semibold"
                >
                  {saving ? "Saving..." : "💾 Save"}
                </button>
              </>
            )}
            <button 
              onClick={downloadPDF} 
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold"
            >
              📄 Export PDF
            </button>
            <button 
              onClick={() => {
                setData(null);
                setError(null);
              }} 
              className="bg-slate-600 hover:bg-slate-700 px-4 py-2 rounded-lg font-semibold"
            >
              🔄 New Analysis
            </button>
          </div>

          <div id="report" className="space-y-10">

            {tab === "overview" && (
              <>
                <ScoreStrip scores={data.scores} />
                <ConsistencyPanel c={data.consistency} />
                <ExecutiveSummary text={data.summary} />
                <StrengthRisk data={data} />
                <HiringVerdict verdict={data.verdict} />
              </>
            )}

            {tab === "github" && <GitHubDeep github={data.github} />}
            {tab === "leetcode" && <LeetCodeDeep leetcode={data.leetcode} />}
            {tab === "skills" && (
              <>
                <SkillRadar skills={data.skills} />
                <LanguageBars languages={data.languages} />
                <RoleFit roles={data.role_fit} best={data.best_role} />
                <SkillGaps gaps={data.skill_gaps} />
              </>
            )}
            {tab === "linkedin" && <LinkedInTab linkedin={data.linkedin} />}
          </div>
        </>
      )}

    </div>
  );
}

/* ================================================= */
/* UI PRIMITIVES */
/* ================================================= */

function Card({ children }) {
  return <div className="bg-white/5 border border-white/10 rounded-2xl p-6">{children}</div>;
}

/* ================================================= */

function CandidateHeader({ data }) {
  return (
    <div className="flex gap-6 items-center bg-white/5 p-6 rounded-2xl">
      <img src={data.candidate.photo} className="w-24 h-24 rounded-full" />
      <div className="flex-1">
        <h2 className="text-2xl font-bold">{data.candidate.name}</h2>
        <p className="text-slate-400">{data.candidate.headline}</p>
        <p className="text-green-400 mt-2">Overall {data.scores.overall}/100</p>
        <p className="text-slate-400">Top {data.percentile}% percentile</p>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(window.location.origin + "/candidate/" + data.candidate.id);
          alert("Link copied");
        }}
        className="bg-white/10 px-4 py-2 rounded"
      >
        🔗 Share
      </button>
    </div>
  );
}

/* ================================================= */

function TabBar({ tab, setTab }) {
  const tabs = ["overview", "github", "leetcode", "skills", "linkedin"];
  return (
    <div className="flex gap-2 bg-white/5 p-2 rounded-xl w-fit">
      {tabs.map(t => (
        <button key={t} onClick={() => setTab(t)}
          className={`px-4 py-2 rounded-lg transition-colors ${tab === t ? "bg-teal-500/20 text-teal-400 border border-teal-500/30" : "text-zinc-400 hover:text-white"}`}>
          {t}
        </button>
      ))}
    </div>
  );
}

/* ================================================= */

function ScoreStrip({ scores }) {
  return (
    <div className="grid md:grid-cols-4 gap-4">
      {Object.entries(scores).map(([k, v]) => (
        <Card key={k}>
          <p>{k}</p>
          <p className="text-3xl font-bold">{v}</p>
        </Card>
      ))}
    </div>
  );
}

function ConsistencyPanel({ c }) {
  return (
    <Card>
      <h3>Consistency</h3>
      <p>Days / Week: {c.days_per_week}</p>
      <p>Active Weeks: {c.active_weeks}</p>
      <p>Momentum: {c.momentum}</p>
    </Card>
  );
}

function ExecutiveSummary({ text }) {
  return <Card><h3>Executive Summary</h3><p>{text}</p></Card>;
}

function StrengthRisk({ data }) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card>
        <h3>Strengths</h3>
        {data.strengths.map(s => <p key={s}>✅ {s}</p>)}
      </Card>
      <Card>
        <h3>Risks</h3>
        {data.risks.map(r => <p key={r}>⚠ {r}</p>)}
      </Card>
      <Card>
        <h3>Interview Focus</h3>
        {data.interview_focus.map(i => <p key={i}>🎯 {i}</p>)}
      </Card>
    </div>
  );
}

/* ================================================= */

function GitHubDeep({ github }) {
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-2xl font-bold mb-4">💻 GitHub Analysis</h3>
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 rounded-lg p-4">
            <p className="text-slate-400 text-sm">Repositories</p>
            <p className="text-3xl font-bold">{github.repos}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <p className="text-slate-400 text-sm">Total Stars</p>
            <p className="text-3xl font-bold">{github.stars}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <p className="text-slate-400 text-sm">Weekly Commits</p>
            <p className="text-3xl font-bold">{github.weekly_commits || "N/A"}</p>
          </div>
        </div>
        
        {github.calendar && (
          <div className="mt-6">
            <h4 className="font-semibold mb-2">Contribution Activity</h4>
            <img 
              src={github.calendar} 
              alt="GitHub contribution calendar" 
              className="rounded-lg w-full max-w-4xl"
            />
          </div>
        )}
      </Card>

      {github.top_repos && github.top_repos.length > 0 && (
        <Card>
          <h4 className="font-semibold mb-4">⭐ Top Repositories</h4>
          <div className="space-y-3">
            {github.top_repos.map((r, i) => (
              <div key={i} className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-sm text-slate-400 mt-1">
                      {r.language || "N/A"} • Updated {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "N/A"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-teal-400">⭐ {r.stars || 0}</p>
                    <p className="text-xs text-slate-400">Forks: {r.forks || 0}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {github.suggestions && github.suggestions.length > 0 && (
        <Card>
          <h4 className="font-semibold mb-4">💡 Improvement Suggestions</h4>
          <ul className="space-y-2">
            {github.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-teal-400">•</span>
                <span className="text-slate-300">{s.replace("(GitHub) ", "")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ================================================= */

function LeetCodeDeep({ leetcode }) {
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-2xl font-bold mb-4">🧩 LeetCode Analysis</h3>
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 rounded-lg p-4">
            <p className="text-slate-400 text-sm">Total Solved</p>
            <p className="text-3xl font-bold">{leetcode.total || 0}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <p className="text-slate-400 text-sm">Current Streak</p>
            <p className="text-3xl font-bold text-orange-400">🔥 {leetcode.streak || 0}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <p className="text-slate-400 text-sm">Ranking</p>
            <p className="text-3xl font-bold">{leetcode.rating ? `#${leetcode.rating.toLocaleString()}` : "N/A"}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-green-500/20 rounded-lg p-4 text-center">
            <p className="text-green-400 font-semibold text-2xl">{leetcode.easy || 0}</p>
            <p className="text-sm text-slate-400">Easy</p>
          </div>
          <div className="bg-teal-500/20 rounded-lg p-4 text-center">
            <p className="text-teal-400 font-semibold text-2xl">{leetcode.medium || 0}</p>
            <p className="text-sm text-slate-400">Medium</p>
          </div>
          <div className="bg-red-500/20 rounded-lg p-4 text-center">
            <p className="text-red-400 font-semibold text-2xl">{leetcode.hard || 0}</p>
            <p className="text-sm text-slate-400">Hard</p>
          </div>
        </div>
      </Card>

      {/* Question Circle */}
      <Card>
        <h4 className="font-semibold mb-4">🎯 Solved Problems Circle</h4>
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
                strokeDasharray={`${((leetcode.total || 0) / 2000) * 502.4} 502.4`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-bold">{leetcode.total || 0}</p>
              <p className="text-sm text-slate-400">Solved</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Heatmap Section */}
      <Card>
        <h4 className="font-semibold mb-4">📅 Activity Heatmap</h4>
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-sm text-slate-400 mb-4">
            Visit your LeetCode profile for detailed activity visualization
          </p>
          <div className="text-center text-slate-500">
            <p className="text-sm">Activity heatmap visualization</p>
            <p className="text-xs mt-2">Shows daily problem-solving activity</p>
          </div>
        </div>
      </Card>

      {Object.keys(leetcode.topics || {}).length > 0 && (
        <Card>
          <h4 className="font-semibold mb-4">Topics Mastery</h4>
          <div className="space-y-3">
            {Object.entries(leetcode.topics).map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-semibold capitalize">{k}</span>
                  <span className="text-sm text-slate-400">{v}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-2 bg-teal-500 rounded-full transition-all" 
                    style={{ width: v + "%" }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ================================================= */

function SkillRadar({ skills }) {
  return (
    <Card>
      <h3>Skill Radar</h3>
      <div className="h-80">
        <ResponsiveContainer>
          <RadarChart data={skills}>
            <PolarGrid />
            <PolarAngleAxis dataKey="skill" />
            <PolarRadiusAxis domain={[0, 100]} />
            <Radar dataKey="value" fill="#14b8a6" fillOpacity={0.6} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function LanguageBars({ languages }) {
  return (
    <Card>
      <h3>Languages</h3>
      {languages.map(l => (
        <div key={l.name}>
          <div className="flex justify-between">
            <span>{l.name}</span>
            <span>{l.value}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded">
            <div className="h-2 bg-teal-500" style={{ width: l.value + "%" }} />
          </div>
        </div>
      ))}
    </Card>
  );
}

function RoleFit({ roles, best }) {
  return (
    <Card>
      <h3>Role Fit</h3>
      <p className="text-green-400">Best Role: {best}</p>
      {Object.entries(roles).map(([r, v]) => (
        <p key={r}>{r}: {v}%</p>
      ))}
    </Card>
  );
}

function SkillGaps({ gaps }) {
  return (
    <Card>
      <h3>Skill Gaps</h3>
      {gaps.map(g => <p key={g}>⚠ {g}</p>)}
    </Card>
  );
}

/* ================================================= */

function LinkedInTab({ linkedin }) {
  return (
    <Card>
      <h3>LinkedIn</h3>
      <p>Completeness: {linkedin.completeness}%</p>
      <p>Headline: {linkedin.headline ? "✅" : "❌"}</p>
      <p>About: {linkedin.about ? "✅" : "❌"}</p>
      <p>Projects: {linkedin.projects ? "✅" : "❌"}</p>
      <p>Photo: {linkedin.photo ? "✅" : "❌"}</p>
    </Card>
  );
}

/* ================================================= */

function HiringVerdict({ verdict }) {
  return (
    <div className="bg-teal-500/10 border border-teal-500/30 rounded-2xl p-6">
      <h3>Hiring Verdict</h3>
      <p className="text-3xl font-bold text-teal-400">{verdict.decision}</p>
      <p>Confidence: {verdict.confidence}%</p>
      <p className="text-slate-400 mt-2">{verdict.reason}</p>
    </div>
  );
}
