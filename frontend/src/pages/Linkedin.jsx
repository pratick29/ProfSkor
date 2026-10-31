import { useState } from "react";
import { api } from "../api/client";
import { usePreferences } from "../hooks/usePreferences";
import { supabase } from "../supabase";
import { useAuth } from "../context/AuthContext";
import WeightControl from "../components/WeightControl";
import { saveProfile } from "../utils/saveProfile";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { toast } from "../utils/toast";

/* -------------------------------- */

export default function Linkedin() {
  const prefs = usePreferences();
  const { user } = useAuth();

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [profileName, setProfileName] = useState("");

  const [form, setForm] = useState({
    has_headline: false,
    has_about: false,
    has_projects: false,
    has_photo: false,
    has_experience: false,
    posting: "0 per week",
  });

  if (!prefs) return null;

  /* ---------- Score ---------- */

  async function handleScore() {
    setLoading(true);
    setData(null);

    try {
      const res = await api.post("/score/linkedin", {
        ...form,
        preferences: prefs,
      });

      setData(res.data);
      setProfileName(`LinkedIn - ${new Date().toLocaleDateString()}`);
    } catch (err) {
      console.log(err);
      toast.error(err.message || "Could not calculate the score. Please try again.");
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
    const name = profileName.trim() || `LinkedIn - ${new Date().toLocaleDateString()}`;
    
    const result = await saveProfile(
      user.id,
      "linkedin",
      {
        form: form,
        score: data.score,
        breakdown: data.breakdown,
        suggestions: data.suggestions,
        preferences: prefs.linkedin
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

  async function updatePref(key, value) {
    const updated = {
      ...prefs,
      linkedin: {
        ...prefs.linkedin,
        [key]: value,
      },
    };

    await supabase.from("user_preferences").upsert({
      user_id: user.id,
      preferences: updated,
    });
  }

  /* ---------- Chart ---------- */

  const pieData = data
    ? [
        { name: "Score", value: data.score },
        { name: "Remaining", value: 100 - data.score },
      ]
    : [];

  /* -------------------------------- */

  return (
    <div className="space-y-12">

      {/* Header */}
      <section className="text-center">
        <h1 className="text-4xl font-extrabold">💼 LinkedIn ProfSkor</h1>
        <p className="text-slate-400 mt-2">
          Optimize your LinkedIn profile for recruiter visibility
        </p>
      </section>

      {/* Checklist */}
      <section className="card space-y-4">

        <h3 className="font-semibold text-lg">Profile Checklist</h3>

        <Check label="Strong headline"
          checked={form.has_headline}
          onChange={(v) => setForm({ ...form, has_headline: v })}
        />

        <Check label="About section"
          checked={form.has_about}
          onChange={(v) => setForm({ ...form, has_about: v })}
        />

        <Check label="Projects / Featured"
          checked={form.has_projects}
          onChange={(v) => setForm({ ...form, has_projects: v })}
        />

        <Check label="Profile photo"
          checked={form.has_photo}
          onChange={(v) => setForm({ ...form, has_photo: v })}
        />

        <Check label="Experience section"
          checked={form.has_experience}
          onChange={(v) => setForm({ ...form, has_experience: v })}
        />

        <select
          className="w-full mt-2 rounded-xl bg-black/40 border border-white/10 p-3"
          value={form.posting}
          onChange={(e) =>
            setForm({ ...form, posting: e.target.value })
          }
        >
          <option>0 per week</option>
          <option>1 per week</option>
          <option>2-3 per week</option>
          <option>4+ per week</option>
        </select>

        {/* Advanced Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-teal-400"
        >
          ⚙ Advanced Weight Controls
        </button>

        {/* Advanced Panel */}
        {showAdvanced && (
          <div className="glass p-5 rounded-xl space-y-4">

            <WeightControl
              label="Headline Importance"
              value={prefs.linkedin.headline}
              onChange={(v) => updatePref("headline", v)}
              presets={{ Low: 10, Balanced: 20, High: 30 }}
            />

            <WeightControl
              label="About Section"
              value={prefs.linkedin.about}
              onChange={(v) => updatePref("about", v)}
              presets={{ Low: 10, Balanced: 20, High: 30 }}
            />

            <WeightControl
              label="Projects / Featured"
              value={prefs.linkedin.projects}
              onChange={(v) => updatePref("projects", v)}
              presets={{ Low: 10, Balanced: 20, High: 30 }}
            />

            <WeightControl
              label="Posting Activity"
              value={prefs.linkedin.posting}
              onChange={(v) => updatePref("posting", v)}
              presets={{ Low: 5, Balanced: 15, High: 25 }}
            />

            <WeightControl
              label="Profile Photo"
              value={prefs.linkedin.photo}
              onChange={(v) => updatePref("photo", v)}
              presets={{ Low: 5, Balanced: 10, High: 15 }}
            />

            <WeightControl
              label="Experience Quality"
              value={prefs.linkedin.experience}
              onChange={(v) => updatePref("experience", v)}
              presets={{ Low: 10, Balanced: 15, High: 25 }}
            />

            <div className="pt-4 border-t border-white/10">
              <p className="text-xs text-slate-400 mb-2">
                💡 Tip: For job seekers, prioritize headline, about, and experience. For content creators, focus on posting activity.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const balanced = { headline: 20, about: 20, projects: 20, posting: 15, photo: 10, experience: 15 };
                    Object.keys(balanced).forEach(k => updatePref(k, balanced[k]));
                  }}
                  className="text-xs px-3 py-1 bg-teal-500/20 rounded"
                >
                  Reset to Balanced
                </button>
                <button
                  onClick={() => {
                    const jobSeeker = { headline: 25, about: 25, projects: 15, posting: 10, photo: 10, experience: 15 };
                    Object.keys(jobSeeker).forEach(k => updatePref(k, jobSeeker[k]));
                  }}
                  className="text-xs px-3 py-1 bg-teal-500/20 rounded"
                >
                  Job Seeker Focus
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleScore}
          className="mt-4 w-full bg-teal-500 hover:bg-teal-400 text-white p-3 rounded-xl font-semibold shadow-lg shadow-teal-500/20 transition-all"
        >
          {loading ? "Calculating..." : "Generate LinkedIn Score"}
        </button>

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

          <section className="grid md:grid-cols-3 gap-4">
            <Metric title="LinkedIn Score" value={data.score} big />
          </section>

          <section className="grid lg:grid-cols-2 gap-6">

            <div className="card">
              <h3 className="font-semibold mb-3">Score Meter</h3>
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

            <div className="card">
              <h3 className="font-semibold mb-3">Improvement Suggestions</h3>
              <ul className="space-y-2 text-sm">
                {data.suggestions.map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>

          </section>
        </>
      )}

    </div>
  );
}

/* -------------------------------- */

function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Metric({ title, value, big }) {
  return (
    <div className="card text-center">
      <p className="text-slate-400 text-sm">{title}</p>
      <p className={`${big ? "text-4xl" : "text-3xl"} font-extrabold mt-1`}>
        {value}/100
      </p>
    </div>
  );
}
