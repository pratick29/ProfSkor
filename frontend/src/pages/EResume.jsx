import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { toast } from "../utils/toast";
import {
  DEFAULT_SETTINGS,
  cleanForSave,
  clearGuestResume,
  emptyResume,
  isEmptyResume,
  loadGuestResume,
  normalizeResume,
  publicUrl,
  saveGuestResume,
  timeAgo,
} from "../utils/eresume";
import ResumeView from "../components/eresume/ResumeView";
import EditorForm from "../components/eresume/EditorForm";
import PublishPanel from "../components/eresume/PublishPanel";
import ViewsPanel from "../components/eresume/ViewsPanel";

const TABS = [
  { id: "edit", label: "Edit" },
  { id: "publish", label: "Publish & verify" },
  { id: "views", label: "Views" },
];

/** Add GitHub projects and skills to what's already there, without overwriting anything typed. */
function mergeGithub(prev, gh) {
  const basics = { ...prev.basics };
  for (const [key, value] of Object.entries(gh.basics)) if (value && !basics[key]) basics[key] = value;
  const known = new Set(prev.projects.map((p) => (p.repo || p.name).toLowerCase()));
  const added = gh.projects.filter((p) => !known.has((p.repo || p.name).toLowerCase()));
  const skills = [...prev.skills];
  for (const s of gh.skills) if (!skills.some((x) => x.toLowerCase() === s.toLowerCase())) skills.push(s);
  return { data: { ...prev, basics, skills: skills.slice(0, 60), projects: [...prev.projects, ...added].slice(0, 20) }, added: added.length };
}

export default function EResume() {
  const { user, loading: authLoading } = useAuth();
  const signedIn = !!user && !user.isGuest;
  const [data, setData] = useState(emptyResume);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [server, setServer] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState({ state: "idle" });
  const [tab, setTab] = useState("edit");
  const [mobilePreview, setMobilePreview] = useState(false);
  const [printing, setPrinting] = useState(false);
  // bumped after an import so the editor re-opens the sections that now have content
  const [importVersion, setImportVersion] = useState(0);
  const dirty = useRef(false);

  const update = useCallback((fn) => {
    dirty.current = true;
    setStatus({ state: "pending" });
    setData((prev) => fn(prev));
  }, []);
  const updateSettings = (next) => {
    dirty.current = true;
    setStatus({ state: "pending" });
    setSettings(next);
  };

  // Load: the account copy for signed-in users, otherwise the browser draft.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      const local = loadGuestResume();
      if (signedIn) {
        try {
          const res = await api.get("/eresume/me");
          if (cancelled) return;
          const remote = res.data.resume;
          if (remote) {
            setData(normalizeResume(remote.data));
            setSettings({ ...DEFAULT_SETTINGS, ...remote.settings });
            setServer(remote);
            setStatus({ state: "saved", at: remote.updated_at });
          } else if (local && !isEmptyResume(local.data)) {
            dirty.current = true; // move the guest draft into the account
            setStatus({ state: "pending" });
            setData(local.data);
            setSettings(local.settings);
          }
        } catch (e) {
          if (!cancelled) toast.error(`Couldn't load your e-resume: ${e.message}`);
          if (cancelled) return;
          if (local) {
            setData(local.data);
            setSettings(local.settings);
          }
        }
      } else if (local) {
        setData(local.data);
        setSettings(local.settings);
        setStatus({ state: "local" });
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, signedIn]);

  // Autosave shortly after the last change.
  useEffect(() => {
    if (!loaded || !dirty.current) return;
    const timer = setTimeout(async () => {
      dirty.current = false;
      if (!signedIn) {
        setStatus(saveGuestResume(data, settings) ? { state: "local" } : { state: "error", message: "Browser storage is blocked" });
        return;
      }
      if (isEmptyResume(data) && !server) {
        setStatus({ state: "idle" });
        return;
      }
      setStatus({ state: "saving" });
      try {
        const res = await api.put("/eresume/me", { data: cleanForSave(data), settings });
        setServer(res.data.resume);
        setStatus({ state: "saved", at: res.data.resume.updated_at });
        clearGuestResume();
      } catch (e) {
        dirty.current = true;
        setStatus({ state: "error", message: e.message });
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [data, settings, loaded, signedIn, server]);

  // Warn before leaving with unsaved account changes.
  useEffect(() => {
    const onLeave = (e) => {
      if (signedIn && dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [signedIn]);

  // Print just the resume: render it into a body-level node and hide everything else.
  useEffect(() => {
    if (!printing) return;
    document.body.classList.add("printing-resume");
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
      document.body.classList.remove("printing-resume");
    };
  }, [printing]);

  const liveUrl = server?.published ? publicUrl(server.slug) : "";
  const pending = status.state === "pending" || status.state === "saving";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">E-Resume</h1>
          <p className="mt-1 text-zinc-400">A live resume that proves itself: verified accounts, real project stats, and you see when it's read.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveStatus status={status} signedIn={signedIn} pending={pending} />
          <button type="button" onClick={() => setPrinting(true)} className="btn-secondary !px-4 !py-2 text-sm">
            Download PDF
          </button>
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="btn-primary !px-4 !py-2 text-sm">
              View live page ↗
            </a>
          )}
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1 w-fit" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t.id ? "bg-teal-500/15 text-teal-300" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!loaded ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : tab === "edit" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className={`space-y-4 ${mobilePreview ? "hidden xl:block" : ""}`}>
            <ImportPanel data={data} update={update} prominent={isEmptyResume(data)} onImported={() => setImportVersion((v) => v + 1)} />
            <EditorForm key={importVersion} data={data} update={update} />
          </div>
          <div className={`${mobilePreview ? "" : "hidden xl:block"}`}>
            <div className="xl:sticky xl:top-6">
              <p className="mb-2 text-xs uppercase tracking-widest text-zinc-500">Live preview</p>
              <div className="max-h-[calc(100vh-7rem)] overflow-auto rounded-2xl bg-white shadow-2xl shadow-black/40">
                <ResumeView data={data} verified={server?.verified || {}} liveUrl={liveUrl} preview />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobilePreview(!mobilePreview)}
            className="fixed bottom-5 right-5 z-30 rounded-full bg-teal-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/30 xl:hidden"
          >
            {mobilePreview ? "Back to editor" : "Preview"}
          </button>
        </div>
      ) : !signedIn ? (
        <SignInPrompt />
      ) : tab === "publish" ? (
        <div className="max-w-3xl">
          <PublishPanel
            server={server}
            data={data}
            settings={settings}
            saving={pending}
            onSettings={updateSettings}
            onServer={(r) => setServer(r)}
            onVerified={(r) => {
              setServer(r);
              setData((prev) => ({ ...prev, basics: { ...prev.basics, github: r.data.basics?.github ?? prev.basics.github, leetcode: r.data.basics?.leetcode ?? prev.basics.leetcode } }));
            }}
          />
        </div>
      ) : (
        <div className="max-w-5xl">
          <ViewsPanel published={!!server?.published} />
        </div>
      )}

      {printing &&
        createPortal(
          <div id="resume-print-root">
            <ResumeView data={cleanForSave(data)} verified={server?.verified || {}} liveUrl={liveUrl} />
          </div>,
          document.body
        )}
    </div>
  );
}

function SaveStatus({ status, signedIn, pending }) {
  let text = "";
  let tone = "text-zinc-500";
  if (status.state === "error") {
    text = `Not saved: ${status.message}`;
    tone = "text-red-400";
  } else if (pending) {
    text = "Saving…";
  } else if (status.state === "saved") {
    text = `Saved${status.at ? ` ${timeAgo(status.at)}` : ""}`;
  } else if (!signedIn) {
    text = status.state === "local" ? "Draft saved in this browser" : "Drafts save in this browser";
  }
  return text ? <span className={`max-w-xs truncate text-xs ${tone}`} title={text}>{text}</span> : null;
}

function ImportPanel({ data, update, prominent, onImported }) {
  const [busy, setBusy] = useState(null);
  const [github, setGithub] = useState("");
  const fileRef = useRef(null);

  async function importPdf(file) {
    if (!file) return;
    if (!isEmptyResume(data) && !window.confirm("Replace everything in the editor with this resume?")) return;
    setBusy("pdf");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post("/eresume/import/pdf", form, { timeout: 90000 });
      update(() => normalizeResume(res.data.data));
      onImported();
      toast.success(res.data.source === "ai" ? "Imported. Give each section a quick check." : "Imported. PDFs lose some formatting, so check each section.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function importGithub() {
    if (!github.trim()) return;
    setBusy("github");
    try {
      const res = await api.get("/eresume/import/github", { params: { username: github.trim() } });
      const gh = normalizeResume(res.data.data);
      const added = mergeGithub(data, gh).added;
      update((prev) => mergeGithub(prev, gh).data);
      onImported();
      toast.success(added ? `Added ${added} project${added > 1 ? "s" : ""} from GitHub` : "GitHub details added");
      setGithub("");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`rounded-2xl border p-5 ${prominent ? "border-teal-500/30 bg-teal-500/[0.06]" : "border-white/[0.07] bg-white/[0.02]"}`}>
      <h2 className="font-semibold text-zinc-100">{prominent ? "Start from what you have" : "Import"}</h2>
      {prominent && <p className="mt-1 text-sm text-zinc-400">Upload your current resume or pull your best projects from GitHub. You can edit everything afterwards.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => importPdf(e.target.files?.[0])} />
        <button type="button" disabled={!!busy} onClick={() => fileRef.current?.click()} className="btn-primary !px-4 !py-2 text-sm whitespace-nowrap disabled:opacity-60">
          {busy === "pdf" ? "Reading PDF…" : "Upload resume PDF"}
        </button>
        <div className="flex min-w-[16rem] flex-1 gap-2">
          <input
            value={github}
            onChange={(e) => setGithub(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && importGithub()}
            placeholder="GitHub username"
            className="input !py-2 text-sm"
          />
          <button type="button" disabled={!!busy || !github.trim()} onClick={importGithub} className="btn-secondary !px-4 !py-2 text-sm whitespace-nowrap disabled:opacity-60">
            {busy === "github" ? "Importing…" : "Add from GitHub"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SignInPrompt() {
  return (
    <div className="max-w-xl rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
      <h2 className="text-lg font-semibold text-white">Sign in to publish</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Publishing gives you a link like <span className="text-zinc-200">profskor/r/your-name</span>, verified account badges and view analytics.
        Your draft is saved in this browser and moves to your account when you sign in.
      </p>
      <Link to="/login" className="btn-primary mt-4 inline-block !px-5 !py-2.5 text-sm">Sign in or create an account</Link>
    </div>
  );
}
