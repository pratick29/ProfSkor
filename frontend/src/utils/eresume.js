// Shared helpers for the e-resume editor and public page.

export const GUEST_RESUME_KEY = "profskor_guest_eresume";

export const SECTION_LABELS = {
  proof: "Verified stats",
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  achievements: "Achievements",
};

export const newId = () => Math.random().toString(36).slice(2, 10);

export const emptyBasics = () => ({
  name: "", headline: "", email: "", phone: "", location: "", summary: "",
  website: "", linkedin: "", github: "", leetcode: "",
});
export const emptyExperience = () => ({ id: newId(), role: "", company: "", location: "", start: "", end: "", link: "", bullets: [] });
export const emptyProject = () => ({ id: newId(), name: "", description: "", tech: [], repo_url: "", demo_url: "", repo: "", bullets: [] });
export const emptyEducation = () => ({ id: newId(), school: "", degree: "", start: "", end: "", details: "" });

export const emptyResume = () => ({
  basics: emptyBasics(),
  skills: [],
  experience: [],
  projects: [],
  education: [],
  achievements: [],
});

export const DEFAULT_SETTINGS = { show_email: true, show_phone: false };

/** Fill in anything missing so the editor never sees undefined. */
export function normalizeResume(raw) {
  const data = raw || {};
  const list = (items, make) => (Array.isArray(items) ? items : []).map((item) => ({ ...make(), ...item, id: item?.id || newId() }));
  return {
    basics: { ...emptyBasics(), ...(data.basics || {}) },
    skills: Array.isArray(data.skills) ? data.skills.filter(Boolean) : [],
    experience: list(data.experience, emptyExperience),
    projects: list(data.projects, emptyProject),
    education: list(data.education, emptyEducation),
    achievements: Array.isArray(data.achievements) ? data.achievements.filter(Boolean) : [],
  };
}

export function isEmptyResume(data) {
  const b = data?.basics || {};
  return !b.name && !b.summary && !data?.skills?.length && !data?.experience?.length && !data?.projects?.length && !data?.education?.length;
}

/** Strip blank items/lines before saving, so half-typed rows don't fail validation or clutter the page. */
export function cleanForSave(data) {
  const lines = (items) => (items || []).map((s) => String(s).trim()).filter(Boolean);
  return {
    ...data,
    skills: lines(data.skills),
    achievements: lines(data.achievements),
    experience: data.experience.map((e) => ({ ...e, bullets: lines(e.bullets) })).filter((e) => e.role || e.company || e.bullets.length),
    projects: data.projects.map((p) => ({ ...p, bullets: lines(p.bullets), tech: lines(p.tech) })).filter((p) => p.name || p.description),
    education: data.education.filter((e) => e.school || e.degree),
  };
}

export function loadGuestResume() {
  try {
    const stored = JSON.parse(localStorage.getItem(GUEST_RESUME_KEY) || "null");
    return stored ? { data: normalizeResume(stored.data), settings: { ...DEFAULT_SETTINGS, ...(stored.settings || {}) } } : null;
  } catch {
    return null;
  }
}

export function saveGuestResume(data, settings) {
  try {
    localStorage.setItem(GUEST_RESUME_KEY, JSON.stringify({ data, settings, saved_at: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestResume() {
  try {
    localStorage.removeItem(GUEST_RESUME_KEY);
  } catch {
    // storage blocked; nothing to clear
  }
}

export function slugify(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

export function viaTag(label) {
  return slugify(label).slice(0, 40);
}

export function publicUrl(slug, via) {
  if (!slug) return "";
  const url = `${window.location.origin}/r/${slug}`;
  return via ? `${url}?via=${encodeURIComponent(via)}` : url;
}

/** Mirror of the backend's link rule: '' or http(s) with a real host. Bare domains get https://. */
export function normalizeUrl(value) {
  const v = (value || "").trim();
  if (!v) return { url: "", error: null };
  if (/^(javascript|data|mailto|ftp):/i.test(v) || (/:\/\//.test(v) && !/^https?:\/\//i.test(v))) {
    return { url: v, error: "Links must start with http:// or https://" };
  }
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  const host = url.match(/^https?:\/\/([^/?#]+)/i)?.[1] || "";
  if (/\s/.test(url) || !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(:\d{1,5})?$/i.test(host)) {
    return { url: v, error: "That doesn't look like a valid link" };
  }
  return { url, error: null };
}

export function displayUrl(url) {
  return (url || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/** Username from a bare name or a pasted profile URL (github.com/me, leetcode.com/u/me/). */
export function usernameFrom(value, host) {
  const v = (value || "").trim().replace(/^@/, "");
  const match = v.match(new RegExp(`^(?:https?://)?(?:www\\.)?${host.replace(".", "\\.")}/(.*)$`, "i"));
  if (!match) return v;
  return match[1].split("/").filter((p) => p && p !== "u")[0] || "";
}

export function githubUrl(username) {
  return username ? `https://github.com/${usernameFrom(username, "github.com")}` : "";
}

export function leetcodeUrl(username) {
  return username ? `https://leetcode.com/u/${usernameFrom(username, "leetcode.com")}/` : "";
}

/** Where a skill is backed up on the page: projects/jobs that mention it and GitHub repos in that language. */
export function skillEvidence(skill, data, evidence) {
  const s = skill.toLowerCase();
  const mentions = (text) => new RegExp(`(^|[^a-z0-9+#])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9+#]|$)`, "i").test(text || "");
  const projects = (data.projects || [])
    .filter((p) => (p.tech || []).some((t) => t.toLowerCase() === s) || mentions([p.description, ...(p.bullets || [])].join(" ")))
    .map((p) => p.name)
    .filter(Boolean);
  const jobs = (data.experience || [])
    .filter((e) => mentions([e.role, ...(e.bullets || [])].join(" ")))
    .map((e) => [e.role, e.company].filter(Boolean).join(" at "));
  const languages = evidence?.github?.languages || {};
  const repoKey = Object.keys(languages).find((k) => k.toLowerCase() === s);
  return { projects, jobs, repos: repoKey ? languages[repoKey] : 0 };
}

export function timeAgo(iso) {
  if (!iso) return "";
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [name, size] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export function formatDuration(ms) {
  if (!ms) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function dateRange(start, end) {
  if (start && end) return `${start} – ${end}`;
  return start || end || "";
}
