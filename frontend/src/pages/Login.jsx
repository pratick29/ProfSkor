import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [userType, setUserType] = useState("candidate");
  const navigate = useNavigate();
  const { signInAsGuest } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { user_type: userType } }
        });

        if (signUpError) throw signUpError;
        if (data.user) {
          localStorage.setItem("userType", userType);
          alert("Account created! Please check your email to verify.");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

        if (signInError) throw signInError;
        if (data.user) {
          const type = data.user.user_metadata?.user_type || userType;
          localStorage.setItem("userType", type);
          navigate("/");
        }
      }
    } catch (err) {
      const msg = err?.message || "An error occurred";
      if (msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("network")) {
        setError(
          "Cannot reach server. Check your internet connection or try \"Continue without account\" to use the app locally."
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` }
      });
      if (error) throw error;
    } catch (err) {
      const msg = err?.message || "Google login failed";
      if (msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("network")) {
        setError(
          "Cannot reach server. Try \"Continue without account\" to use the app locally."
        );
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050508] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="card p-8 md:p-10">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold">
              <span className="text-white">Prof</span>
              <span className="text-teal-400">Skor</span>
            </h1>
            <p className="text-zinc-500 mt-2 text-sm">
              {isSignUp ? "Create your account" : "Sign in to continue"}
            </p>
          </div>

          {isSignUp && (
            <div className="mb-6">
              <label className="block text-sm text-zinc-400 mb-3">I am a:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setUserType("candidate")}
                  className={`px-4 py-3 rounded-xl border text-sm font-medium transition ${
                    userType === "candidate"
                      ? "border-teal-500/50 bg-teal-500/15 text-teal-400"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20"
                  }`}
                >
                  Candidate
                </button>
                <button
                  type="button"
                  onClick={() => setUserType("recruiter")}
                  className={`px-4 py-3 rounded-xl border text-sm font-medium transition ${
                    userType === "recruiter"
                      ? "border-teal-500/50 bg-teal-500/15 text-teal-400"
                      : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20"
                  }`}
                >
                  Recruiter
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-500 hover:bg-teal-400 text-white disabled:opacity-50 px-4 py-3 rounded-xl font-semibold transition shadow-lg shadow-teal-500/20"
            >
              {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
            </button>
          </form>

          <div className="mt-6">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-3 rounded-xl font-medium transition flex items-center justify-center gap-2"
            >
              Continue with Google
            </button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              className="text-sm text-teal-400 hover:text-teal-300"
            >
              {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
          </div>

          <div className="mt-4 text-center">
            <button
              onClick={() => {
                signInAsGuest();
                navigate("/");
              }}
              className="text-sm text-teal-400 hover:text-teal-300 font-medium"
            >
              Continue without account →
            </button>
            <p className="text-xs text-zinc-500 mt-1">
              Use all features locally, saves stored on this device
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
