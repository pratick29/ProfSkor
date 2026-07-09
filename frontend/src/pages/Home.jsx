import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";

const spring = { type: "spring", stiffness: 120, damping: 20 };

export default function Home() {
  const { userType } = useAuth();
  const isRecruiter = userType === "recruiter";

  return (
    <div className="space-y-24 md:space-y-32">
      {/* HERO */}
      <section className="relative text-center pt-16 md:pt-24 max-w-4xl mx-auto">
        <div className="absolute inset-0 blur-[120px] opacity-20 bg-teal-500/30 -z-10" />
        
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="text-5xl md:text-7xl font-bold tracking-tight"
        >
          <span className="text-white">Prof</span>
          <span className="text-teal-400">Skor</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...spring, delay: 0.15 }}
          className="text-lg md:text-xl text-zinc-400 mt-4 font-medium"
        >
          Where Profiles Become Proof
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...spring, delay: 0.3 }}
          className="max-w-xl mx-auto mt-6 text-zinc-400 leading-relaxed"
        >
          {isRecruiter
            ? "AI-powered talent intelligence to evaluate, compare, and discover top candidates."
            : "AI-powered career intelligence to analyze, customize, and track your professional readiness."}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.45 }}
          className="flex flex-wrap justify-center gap-3 mt-10"
        >
          {isRecruiter ? (
            <>
              <Link
                to="/search"
                className="px-6 py-3 rounded-xl font-semibold bg-teal-500 text-white hover:bg-teal-400 shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 hover:-translate-y-0.5"
              >
                Search Candidates
              </Link>
              <Link
                to="/compare"
                className="px-6 py-3 rounded-xl font-semibold bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                Compare Profiles
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/full"
                className="px-6 py-3 rounded-xl font-semibold bg-teal-500 text-white hover:bg-teal-400 shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 hover:-translate-y-0.5"
              >
                Get Your ProfSkor
              </Link>
              <Link
                to="/compare"
                className="px-6 py-3 rounded-xl font-semibold bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                View Demo
              </Link>
            </>
          )}
        </motion.div>

        <p className="mt-10 text-xs text-zinc-500 uppercase tracking-widest">
          Trusted by developers preparing for top tech roles
        </p>
      </section>

      {/* DIVIDER */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent max-w-2xl mx-auto" />

      {/* FEATURES */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="max-w-6xl mx-auto"
      >
        <h2 className="text-2xl font-semibold text-zinc-300 text-center mb-10">
          What we offer
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {(isRecruiter
            ? [
                { icon: "▤", title: "Candidate Search", desc: "Find and evaluate top talent" },
                { icon: "◇", title: "Profile Analysis", desc: "Comprehensive candidate scoring" },
                { icon: "◈", title: "Custom Criteria", desc: "Set your own evaluation weights" },
                { icon: "◷", title: "Analytics", desc: "Track candidate performance" },
                { icon: "≋", title: "Compare", desc: "Compare multiple candidates" },
                { icon: "◆", title: "Export Reports", desc: "Download candidate reports" }
              ]
            : [
                { icon: "◇", title: "Profile Scoring", desc: "GitHub, LeetCode & LinkedIn" },
                { icon: "▤", title: "AI Resume Review", desc: "Instant strengths & weaknesses" },
                { icon: "◈", title: "Custom Weights", desc: "Control what matters to you" },
                { icon: "◷", title: "Analytics", desc: "Track growth over time" },
                { icon: "≋", title: "Compare", desc: "Benchmark against others" },
                { icon: "◆", title: "PDF Reports", desc: "Download & share results" }
              ]
          ).map((f, i) => (
            <motion.div
              key={f.title}
              whileHover={{ y: -4 }}
              transition={spring}
              className="card group"
            >
              <span className="text-2xl font-mono text-teal-500/80 group-hover:text-teal-400 transition-colors">
                {f.icon}
              </span>
              <h3 className="font-semibold text-white mt-3">{f.title}</h3>
              <p className="text-zinc-500 text-sm mt-1">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* HOW IT WORKS */}
      <section className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-semibold text-zinc-300 text-center mb-10">
          How it works
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {["Connect Profiles", "Customize Scoring", "Get ProfSkor", "Improve"].map((t, i) => (
            <motion.div
              key={t}
              whileHover={{ scale: 1.02 }}
              className="card text-center py-8"
            >
              <span className="text-sm font-mono text-teal-500/60">{String(i + 1).padStart(2, "0")}</span>
              <p className="font-medium text-zinc-200 mt-2">{t}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative text-center py-20">
        <div className="absolute inset-0 blur-[100px] opacity-10 bg-teal-500/40 -z-10" />
        <h2 className="text-3xl md:text-4xl font-bold text-white">
          Start building proof
        </h2>
        <p className="text-zinc-500 mt-2">
          Create your ProfSkor in seconds
        </p>
        <Link
          to="/full"
          className="inline-block mt-8 px-10 py-4 rounded-xl font-semibold bg-teal-500 text-white hover:bg-teal-400 shadow-lg shadow-teal-500/30 transition-all hover:shadow-teal-500/50 hover:-translate-y-0.5"
        >
          Get started free
        </Link>
      </section>
    </div>
  );
}
