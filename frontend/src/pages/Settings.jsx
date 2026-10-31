import { api } from "../api/client";
import { DEFAULT_PREFS, usePreferences } from "../hooks/usePreferences";
import { toast } from "../utils/toast";

const TEMPLATE_LABELS = { ai_ml: "AI / ML Engineer", backend: "Backend Engineer", cp: "Competitive Programmer" };

export default function Settings() {
  const { prefs, updatePrefs, savePrefs: persistPrefs } = usePreferences();
  // Edits on this page are drafts until the user clicks Save
  const setPrefs = (next) => updatePrefs(next, { persist: false });

  /* ---------------- SAVE ---------------- */

  async function savePrefs() {
    const total =
      prefs.platform_weights.github +
      prefs.platform_weights.leetcode +
      prefs.platform_weights.linkedin;

    if (prefs.mode === "custom" && total !== 100) {
      toast.error("Platform weights must total 100%");
      return;
    }

    if (prefs.mode === "default") {
      updatePrefs(DEFAULT_PREFS, { persist: false });
    }
    const { error } = await persistPrefs();
    if (error) {
      toast.error("Couldn't save preferences. Please try again.");
      return;
    }
    toast.success("✅ Preferences saved");
  }

  /* ---------------- APPLY TEMPLATE ---------------- */

  async function applyTemplate(name) {
    try {
      const res = await api.get(`/templates/${name}`);
      // Templates only cover per-platform weights; keep the platform split
      updatePrefs((prev) => ({ ...prev, ...res.data, mode: "custom" }), { persist: false });
      const { error } = await persistPrefs();
      if (error) throw error;
      toast.success(`✅ Applied ${TEMPLATE_LABELS[name] || name} template`);
    } catch (err) {
      toast.error(err.message || "Couldn't apply template");
    }
  }

  const total =
    prefs.platform_weights.github +
    prefs.platform_weights.leetcode +
    prefs.platform_weights.linkedin;

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* Header */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
        <h2 className="text-2xl font-bold">⚙ Scoring Settings</h2>
        <p className="text-slate-400">
          Control how your profile is evaluated
        </p>
      </div>

      {/* MODE */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">

        <p className="font-semibold">Scoring Mode</p>

        <div className="flex gap-6">

          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={prefs.mode === "default"}
              onChange={() =>
                setPrefs({ ...prefs, mode: "default" })
              }
            />
            System Default
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={prefs.mode === "custom"}
              onChange={() =>
                setPrefs({ ...prefs, mode: "custom" })
              }
            />
            Custom Weights
          </label>

        </div>
      </div>

      {/* TEMPLATES */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">

        <h3 className="font-semibold">Weight Templates</h3>
        <p className="text-slate-400 text-sm">
          One-click presets for different roles
        </p>

        <div className="flex gap-3 flex-wrap">

          <button
            onClick={() => applyTemplate("ai_ml")}
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white"
          >
            AI / ML Engineer
          </button>

          <button
            onClick={() => applyTemplate("backend")}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700"
          >
            Backend Engineer
          </button>

          <button
            onClick={() => applyTemplate("cp")}
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700"
          >
            Competitive Programmer
          </button>

        </div>
      </div>

      {/* CUSTOM WEIGHTS */}
      {prefs.mode === "custom" && (
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">

          <h3 className="font-semibold text-lg">
            Platform Importance
          </h3>

          {/* Quick Presets */}
          <div className="flex gap-3 flex-wrap">

            <button
              onClick={() =>
                setPrefs({
                  ...prefs,
                  platform_weights: {
                    github: 50,
                    leetcode: 30,
                    linkedin: 20
                  }
                })
              }
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20"
            >
              Portfolio Focus
            </button>

            <button
              onClick={() =>
                setPrefs({
                  ...prefs,
                  platform_weights: {
                    github: 30,
                    leetcode: 50,
                    linkedin: 20
                  }
                })
              }
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20"
            >
              DSA Focus
            </button>

            <button
              onClick={() =>
                setPrefs({
                  ...prefs,
                  platform_weights: {
                    github: 33,
                    leetcode: 33,
                    linkedin: 34
                  }
                })
              }
              className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20"
            >
              Balanced
            </button>

          </div>

          {/* Sliders */}
          <Slider
            label="GitHub"
            value={prefs.platform_weights.github}
            onChange={v =>
              setPrefs({
                ...prefs,
                platform_weights: {
                  ...prefs.platform_weights,
                  github: v
                }
              })
            }
          />

          <Slider
            label="LeetCode"
            value={prefs.platform_weights.leetcode}
            onChange={v =>
              setPrefs({
                ...prefs,
                platform_weights: {
                  ...prefs.platform_weights,
                  leetcode: v
                }
              })
            }
          />

          <Slider
            label="LinkedIn"
            value={prefs.platform_weights.linkedin}
            onChange={v =>
              setPrefs({
                ...prefs,
                platform_weights: {
                  ...prefs.platform_weights,
                  linkedin: v
                }
              })
            }
          />

          {/* Total */}
          <p
            className={`text-center font-semibold ${
              total === 100
                ? "text-green-400"
                : "text-red-400"
            }`}
          >
            Total: {total}%
          </p>

        </div>
      )}

      {/* RESET */}
      <button
        onClick={() =>
          setPrefs(DEFAULT_PREFS)
        }
        className="text-sm text-red-400 underline"
      >
        Reset to Default
      </button>

      {/* SAVE */}
      <button
        onClick={savePrefs}
        className="w-full bg-teal-500 hover:bg-teal-400 text-white transition p-4 rounded-2xl font-semibold shadow-lg shadow-teal-500/20"
      >
        Save Preferences
      </button>

    </div>
  );
}

/* ---------------- SLIDER ---------------- */

function Slider({ label, value, onChange }) {
  return (
    <div className="space-y-2">

      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-teal-400 font-semibold">
          {value}%
        </span>
      </div>

      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-teal-500 cursor-pointer"
      />

      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-teal-500 transition-all"
          style={{ width: `${value}%` }}
        />
      </div>

    </div>
  );
}
