import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const links = [
  { label: "Home", path: "/", icon: "◉" },
  { label: "E-Resume", path: "/eresume", icon: "▣" },
  { label: "GitHub", path: "/github", icon: "⌗" },
  { label: "LeetCode", path: "/leetcode", icon: "◈" },
  { label: "LinkedIn", path: "/linkedin", icon: "◆" },
  { label: "Full Score", path: "/full", icon: "★" },
  { label: "Analytics", path: "/analytics", icon: "▤" },
  { label: "History", path: "/history", icon: "◷" },
  { label: "Resume AI", path: "/resume", icon: "◇" },
  { label: "Compare", path: "/compare", icon: "≋" },
  { label: "Search", path: "/search", icon: "◉" },
  { label: "Settings", path: "/settings", icon: "⚙" }
];

export default function Sidebar() {
  const { isAdmin } = useAuth();
  const visibleLinks = isAdmin ? [...links, { label: "Admin", path: "/admin", icon: "⎈" }] : links;

  return (
    <aside className="w-56 md:w-64 shrink-0 border-r border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-xl">
      <div className="sticky top-0 h-screen flex flex-col py-6 px-4">
        {/* Logo */}
        <div className="px-3 mb-8">
          <span className="text-xl font-bold tracking-tight text-white">
            Prof<span className="text-teal-500">Skor</span>
          </span>
          <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-widest">
            Profile Intelligence
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {visibleLinks.map(({ label, path, icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-teal-500/15 text-teal-400 border border-teal-500/20"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200 border border-transparent"
                }`
              }
            >
              <span className="text-xs font-mono opacity-60">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer hint */}
        <div className="pt-6 mt-auto">
          <p className="text-[10px] text-zinc-600 px-3">
            Built for developers
          </p>
        </div>
      </div>
    </aside>
  );
}
