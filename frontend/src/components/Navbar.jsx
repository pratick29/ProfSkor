import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";

export default function Navbar() {
  const { user, signOutGuest } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    if (user?.isGuest) {
      signOutGuest();
      navigate("/login");
      return;
    }
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <header className="sticky top-0 z-40 h-14 md:h-16 border-b border-white/[0.06] bg-[#0a0a0f]/90 backdrop-blur-xl">
      <div className="h-full flex items-center justify-between px-6 md:px-8">
        <p className="text-xs text-zinc-500 font-medium">
          {user?.isGuest
            ? "Guest"
            : user?.user_metadata?.user_type === "recruiter"
            ? "Recruiter"
            : "Candidate"}{" "}
          view
        </p>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-xs text-zinc-500 hidden sm:block max-w-[140px] truncate">
                {user.isGuest ? "Using locally" : user.email}
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 border border-white/[0.06] hover:border-red-500/20 transition-all"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 border border-teal-500/30 transition-all"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
