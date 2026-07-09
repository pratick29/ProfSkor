import { useState } from "react";
import { motion } from "framer-motion";
import Loading from "../components/Loading";
import { api } from "../api/client";

export default function ResumeAI() {
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleUpload() {
    if (!file) {
      setError("Please select a PDF file to upload");
      return;
    }

    if (!file.name.endsWith('.pdf')) {
      setError("Please upload a PDF file");
      return;
    }

    setLoading(true);
    setData(null);
    setError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await api.post("/ai/resume-review", form, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 30000,
      });

      if (res.data?.error) {
        setError(res.data.error);
        return;
      }

      setData(res.data);
    } catch (err) {
      console.error("Resume upload error:", err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else if (err.code === 'ECONNABORTED') {
        setError("Request timeout. Please try again.");
      } else if (err.response) {
        setError(`Server error: ${err.response.status}. Please check if the backend is running.`);
      } else {
        setError("Failed to upload resume. Please check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="card">
        <h2 className="text-2xl font-bold">🤖 AI Resume Intelligence</h2>
        <p className="text-slate-300 mt-1">
          Upload your resume and receive recruiter-grade feedback.
        </p>
      </div>

      {/* Upload */}
      <div className="card space-y-4">

        <label className="block text-sm text-slate-300">
          Upload Resume (PDF)
        </label>

        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files[0])}
          className="block w-full text-sm text-slate-300
            file:mr-4 file:py-2 file:px-4
            file:rounded-xl file:border-0
            file:bg-teal-500 file:text-white
            hover:file:bg-teal-400"
        />

        <button
          onClick={handleUpload}
          disabled={loading}
          className="w-full bg-teal-500 hover:bg-teal-400 text-white disabled:opacity-50 p-3 rounded-xl font-semibold shadow-lg shadow-teal-500/20 transition-all"
        >
          {loading ? "Analyzing Resume..." : "Analyze Resume"}
        </button>

        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

      </div>

      {loading && <Loading message="Analyzing your resume..." />}

      {/* Results */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >

          {/* Score */}
          <div className="grid md:grid-cols-3 gap-4">

            <ScoreCard label="Resume Score" value={`${data.score}/100`} big />

          </div>

          {/* Lists */}
          <div className="grid lg:grid-cols-3 gap-6">

            <ListCard title="✅ Strengths" items={data.strengths} />

            <ListCard title="⚠ Weaknesses" items={data.weaknesses} />

            <ListCard title="🚀 Improvements" items={data.improvements} />

          </div>

          {/* Role Fit */}
          <div className="card">
            <h3 className="font-semibold mb-2">🎯 Role Fit</h3>
            <p className="text-slate-300">{data.role_fit}</p>
          </div>

        </motion.div>
      )}

    </div>
  );
}

/* -------------------- */

function ScoreCard({ label, value, big }) {
  return (
    <div className="rounded-3xl bg-white/5 border border-white/10 p-6">
      <p className="text-slate-400 text-sm">{label}</p>
      <p className={`${big ? "text-4xl" : "text-3xl"} font-bold mt-2`}>
        {value}
      </p>
    </div>
  );
}

function ListCard({ title, items }) {
  return (
    <div className="card">
      <h3 className="font-semibold mb-3">{title}</h3>
      <ul className="space-y-2 text-sm text-slate-200">
        {items?.map((x, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-teal-400">•</span>
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
