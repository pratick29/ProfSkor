// Non-blocking notifications (replaces window.alert, which freezes the page).
const COLORS = {
  info: { bg: "rgba(20, 184, 166, 0.15)", border: "rgba(20, 184, 166, 0.5)", text: "#99f6e4" },
  success: { bg: "rgba(34, 197, 94, 0.15)", border: "rgba(34, 197, 94, 0.5)", text: "#bbf7d0" },
  error: { bg: "rgba(239, 68, 68, 0.15)", border: "rgba(239, 68, 68, 0.5)", text: "#fecaca" },
};

function container() {
  let el = document.getElementById("toast-root");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast-root";
    el.setAttribute("aria-live", "polite");
    Object.assign(el.style, {
      position: "fixed", top: "16px", right: "16px", zIndex: 9999,
      display: "flex", flexDirection: "column", gap: "8px", maxWidth: "min(380px, calc(100vw - 32px))",
    });
    document.body.appendChild(el);
  }
  return el;
}

export function toast(message, type = "info", durationMs = 4500) {
  const c = COLORS[type] || COLORS.info;
  const item = document.createElement("div");
  item.setAttribute("role", type === "error" ? "alert" : "status");
  item.textContent = String(message);
  Object.assign(item.style, {
    background: c.bg, border: `1px solid ${c.border}`, color: c.text,
    backdropFilter: "blur(12px)", borderRadius: "12px", padding: "12px 16px",
    fontSize: "14px", lineHeight: "1.4", cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  });
  item.onclick = () => item.remove();
  container().appendChild(item);
  setTimeout(() => item.remove(), durationMs);
}

toast.success = (message) => toast(message, "success");
toast.error = (message) => toast(message, "error", 7000);
