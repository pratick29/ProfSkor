import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import ResumeView from "../components/eresume/ResumeView";
import { normalizeResume, publicUrl } from "../utils/eresume";

/**
 * Anonymous engagement tracking for a public resume: one view per visit, time spent while the tab
 * is visible, which sections were scrolled into view, and which links were clicked. Updates go out
 * with sendBeacon so they survive the tab closing.
 */
function useViewTracking(slug, enabled, via) {
  const state = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    const s = { viewId: null, duration: 0, visibleSince: null, sections: new Set(), clicks: [], stopped: false };
    state.current = s;
    const base = (api.defaults.baseURL || "").replace(/\/$/, "");
    const elapsed = () => s.duration + (s.visibleSince ? Date.now() - s.visibleSince : 0);
    const send = () => {
      if (!s.viewId) return;
      const url = `${base}/eresume/public/${encodeURIComponent(slug)}/views/${s.viewId}`;
      const body = JSON.stringify({
        duration_ms: Math.min(Math.round(elapsed()), 6 * 3600 * 1000),
        sections: [...s.sections].slice(0, 20),
        clicks: s.clicks.slice(-50),
      });
      // A plain string goes as text/plain, which needs no CORS preflight
      if (!(navigator.sendBeacon && navigator.sendBeacon(url, body))) {
        fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
      }
    };
    s.send = send;
    s.visibleSince = document.visibilityState === "visible" ? Date.now() : null;

    api
      .post(`/eresume/public/${encodeURIComponent(slug)}/views`, { via: via || null, referrer: document.referrer || null })
      .then((res) => {
        if (s.stopped) return;
        s.viewId = res.data.view_id;
        // A refresh continues the earlier view, so carry its numbers forward
        s.duration += res.data.duration_ms || 0;
        (res.data.sections || []).forEach((x) => s.sections.add(x));
        s.clicks = [...(res.data.clicks || []), ...s.clicks].slice(-50);
      })
      .catch(() => {});

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (s.visibleSince) s.duration += Date.now() - s.visibleSince;
        s.visibleSince = null;
        send();
      } else {
        s.visibleSince = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", send);
    const timer = setInterval(() => document.visibilityState === "visible" && send(), 30000);

    // A section counts as read when it sits in the middle band of the screen at a once-a-second check,
    // so sections the visitor only scrolls past quickly don't count
    const sample = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const top = window.innerHeight * 0.3;
      const bottom = window.innerHeight * 0.7;
      document.querySelectorAll(".resume-doc [data-section]").forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < bottom && rect.bottom > top) s.sections.add(el.dataset.section);
      });
    }, 1000);

    return () => {
      send();
      s.stopped = true;
      clearInterval(timer);
      clearInterval(sample);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", send);
    };
  }, [slug, enabled, via]);

  return useCallback((kind, target) => {
    const s = state.current;
    if (!s) return;
    s.clicks.push({ kind, target: String(target || "").slice(0, 300) });
    if (s.clicks.length > 50) s.clicks.shift();
    s.send?.();
  }, []);
}

export default function PublicResume() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const via = params.get("via");
  const [result, setResult] = useState({ slug: null, resume: null, error: null });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/eresume/public/${encodeURIComponent(slug)}`)
      .then((res) => !cancelled && setResult({ slug, resume: res.data, error: null }))
      .catch((e) => !cancelled && setResult({ slug, resume: null, error: e.response?.status === 404 ? "missing" : e.message }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const loading = result.slug !== slug;
  const resume = loading ? null : result.resume;
  const data = useMemo(() => (resume ? normalizeResume(resume.data) : null), [resume]);
  const track = useViewTracking(slug, !!resume && resume.published && !resume.is_owner, via);

  useEffect(() => {
    if (data) document.title = `${data.basics.name || slug} · Resume`;
    return () => {
      document.title = "ProfSkor — Where Profiles Become Proof";
    };
  }, [data, slug]);

  const liveUrl = publicUrl(slug);

  async function copyLink() {
    track("copy", "link");
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", liveUrl);
    }
  }

  return (
    <div className="public-resume min-h-screen bg-slate-100 text-slate-800 print:bg-white">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[850px] items-center gap-3 px-4 py-2.5">
          <Link to="/" className="text-sm font-bold tracking-tight text-slate-900">
            Prof<span className="text-teal-600">Skor</span>
          </Link>
          <span className="hidden text-xs text-slate-500 sm:inline">Live resume</span>
          <span className="flex-1" />
          {resume && (
            <>
              {resume.is_owner && (
                <Link to="/eresume" className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                  Edit
                </Link>
              )}
              <button type="button" onClick={copyLink} className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  track("download", "pdf");
                  window.print();
                }}
                className="whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                <span className="sm:hidden">PDF</span>
                <span className="hidden sm:inline">Download PDF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {resume?.is_owner && (
        <div className={`print:hidden ${resume.published ? "bg-teal-50 text-teal-900" : "bg-amber-50 text-amber-900"}`}>
          <p className="mx-auto max-w-[850px] px-4 py-2 text-sm">
            {resume.published
              ? "This is your public page. Your own visits aren't counted in Views."
              : "Draft: only you can see this page. Publish it from the editor to share it."}
          </p>
        </div>
      )}

      <main className="px-0 py-0 sm:px-4 sm:py-10 print:p-0">
        {loading ? (
          <p className="py-24 text-center text-sm text-slate-500">Loading…</p>
        ) : result.error === "missing" ? (
          <div className="mx-auto max-w-md py-24 text-center">
            <h1 className="text-xl font-semibold text-slate-900">Resume not found</h1>
            <p className="mt-2 text-sm text-slate-500">This link may be mistyped, or the owner has unpublished it.</p>
            <Link to="/eresume" className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Make your own e-resume
            </Link>
          </div>
        ) : result.error ? (
          <p className="py-24 text-center text-sm text-red-600">{result.error}</p>
        ) : (
          <>
            <div className="mx-auto max-w-[850px] bg-white shadow-xl shadow-slate-300/50 sm:rounded-xl print:max-w-none print:shadow-none">
              <ResumeView data={data} verified={resume.verified} evidence={resume.evidence} liveUrl={liveUrl} onTrack={track} />
            </div>
            <p className="mx-auto mt-4 max-w-[850px] px-4 text-center text-xs text-slate-500 print:hidden">
              The owner sees anonymous view counts for this page. No cookies or personal data are stored.{" "}
              <Link to="/eresume" className="underline hover:text-slate-700">Make your own</Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
