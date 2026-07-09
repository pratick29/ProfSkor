export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#050508",
        panel: "#0a0a0f",
        surface: "#111118",
        surface2: "#18181f",
        card: "#14141c",
        accent: "#14b8a6",
        accent2: "#06b6d4",
        accentMuted: "rgba(20, 184, 166, 0.15)",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        info: "#06b6d4",
        text: "#f4f4f5",
        muted: "#71717a",
        border: "rgba(255,255,255,0.06)"
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem"
      },
      boxShadow: {
        "glow": "0 0 40px -10px rgba(20, 184, 166, 0.3)",
        "card": "0 4px 24px -4px rgba(0,0,0,0.4)",
        "inner-glow": "inset 0 1px 0 0 rgba(255,255,255,0.04)"
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "mesh": "linear-gradient(135deg, #0a0a0f 0%, #111118 50%, #0a0a0f 100%)"
      },
      animation: {
        "float": "float 6s ease-in-out infinite",
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "gradient": "gradient 8s ease infinite",
        "shimmer": "shimmer 3s linear infinite"
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" }
        },
        gradient: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" }
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" }
        }
      }
    }
  },
  plugins: []
}
