import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { toast } from "../../utils/toast";
import { publicUrl, slugify, timeAgo, viaTag } from "../../utils/eresume";

const LINKS_KEY = "profskor_tracked_links";

function loadLinks() {
  try {
    return JSON.parse(localStorage.getItem(LINKS_KEY) || "[]");
  } catch {
    return [];
  }
}

async function copy(text, message = "Link copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast(text);
  }
}

/** Handle + publish toggle, contact privacy, account verification and tracked links. */
export default function PublishPanel({ server, data, settings, onSettings, onServer, onVerified, saving }) {
  const [slug, setSlug] = useState(server?.slug || slugify(data.basics.name));
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    const value = slug.trim().toLowerCase();
    if (!value || value === server?.slug) {
      setCheck(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/eresume/slug/${encodeURIComponent(value)}`);
        if (!cancelled) setCheck(res.data);
      } catch {
        if (!cancelled) setCheck(null);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [slug, server?.slug]);

  if (!server) {
    return (
      <Card title="Publish">
        <p className="text-sm text-zinc-400">{saving ? "Saving your resume…" : "Add your name in the editor first. Your resume saves automatically, then you can publish it here."}</p>
      </Card>
    );
  }

  const live = server.published && server.slug;
  const url = publicUrl(server.slug);

  async function publish(published) {
    setBusy("publish");
    try {
      const res = await api.put("/eresume/me/publish", { slug: slug.trim().toLowerCase(), published });
      onServer(res.data.resume);
      toast.success(published ? "Your e-resume is live" : "Your e-resume is now private");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function verify(platform) {
    setBusy(platform);
    try {
      const res = await api.post(`/eresume/me/verify/${platform}`);
      onVerified(res.data.resume);
      toast.success(`${platform === "github" ? "GitHub" : "LeetCode"} verified. You can remove the code from your profile now.`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  const slugChanged = slug.trim().toLowerCase() !== (server.slug || "");
  const slugBlocked = slugChanged && check && !check.available;

  return (
    <div className="space-y-4">
      <Card title="Your link" subtitle="One link for every application. Update the resume any time and the link stays the same.">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <label className="flex-1">
            <span className="sr-only">Handle</span>
            <div className="flex items-center rounded-xl border border-white/[0.08] bg-white/[0.03] focus-within:border-teal-500">
              <span className="whitespace-nowrap pl-3 text-sm text-zinc-500">{window.location.host}/r/</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30))}
                placeholder="your-name"
                className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm text-white outline-none"
              />
            </div>
            {slugChanged && check && (
              <span className={`mt-1 block text-xs ${check.available ? "text-emerald-400" : "text-red-400"}`}>
                {check.available ? "Available" : check.reason}
              </span>
            )}
          </label>
          {live ? (
            <div className="flex gap-2">
              {slugChanged && (
                <button type="button" disabled={busy || slugBlocked || !slug} onClick={() => publish(true)} className="btn-primary !px-4 !py-2.5 text-sm disabled:opacity-50">
                  Change link
                </button>
              )}
              <button type="button" disabled={!!busy} onClick={() => publish(false)} className="btn-secondary !px-4 !py-2.5 text-sm">
                Unpublish
              </button>
            </div>
          ) : (
            <button type="button" disabled={!!busy || slugBlocked || !slug || !data.basics.name} onClick={() => publish(true)} className="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-50">
              {busy === "publish" ? "Publishing…" : "Publish"}
            </button>
          )}
        </div>
        {!data.basics.name && <p className="mt-2 text-xs text-amber-300">Add your name in the editor before publishing.</p>}
        {live ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-teal-500/10 px-4 py-3 text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-200 hover:underline">{url}</a>
            <span className="flex-1" />
            <button type="button" onClick={() => copy(url)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20">Copy</button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20">Open</a>
          </div>
        ) : (
          server.slug && <p className="mt-3 text-xs text-zinc-500">Not published. Only you can open {url}.</p>
        )}
      </Card>

      <Card title="Contact details on the public page">
        <Toggle label="Show email" checked={settings.show_email} onChange={(v) => onSettings({ ...settings, show_email: v })} />
        <Toggle label="Show phone number" checked={settings.show_phone} onChange={(v) => onSettings({ ...settings, show_phone: v })} />
        <p className="text-xs text-zinc-500">Hidden details are removed by the server, not just hidden on screen.</p>
      </Card>

      <Card title="Prove your accounts are yours" subtitle="Verified accounts get a badge, plus live stats a recruiter can trust because you can't type them in.">
        <VerifyRow
          name="GitHub"
          username={data.basics.github}
          entry={server.verified?.github}
          code={server.verify_code}
          where={<>your <a className="text-teal-300 hover:underline" href="https://github.com/settings/profile" target="_blank" rel="noopener noreferrer">GitHub bio</a></>}
          busy={busy === "github"}
          onVerify={() => verify("github")}
        />
        <VerifyRow
          name="LeetCode"
          username={data.basics.leetcode}
          entry={server.verified?.leetcode}
          code={server.verify_code}
          where={<>your <a className="text-teal-300 hover:underline" href="https://leetcode.com/profile/" target="_blank" rel="noopener noreferrer">LeetCode profile Summary</a></>}
          busy={busy === "leetcode"}
          onVerify={() => verify("leetcode")}
        />
        <div className="flex items-start justify-between gap-3 rounded-xl bg-black/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-zinc-200">Email</p>
            <p className="text-xs text-zinc-500">Verified automatically when the resume email matches your confirmed account email.</p>
          </div>
          <Status ok={!!server.verified?.email} />
        </div>
      </Card>

      {live && <TrackedLinks slug={server.slug} />}
    </div>
  );
}

function VerifyRow({ name, username, entry, code, where, busy, onVerify }) {
  const verified = entry && username && entry.username?.toLowerCase() === username.toLowerCase();
  return (
    <div className="rounded-xl bg-black/20 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">
            {name} {username && <span className="font-normal text-zinc-500">@{username}</span>}
          </p>
          {verified ? (
            <p className="text-xs text-zinc-500">Verified {timeAgo(entry.verified_at)}</p>
          ) : !username ? (
            <p className="text-xs text-zinc-500">Add your {name} username in Basics first.</p>
          ) : null}
        </div>
        {verified ? <Status ok /> : username && (
          <button type="button" onClick={onVerify} disabled={busy} className="btn-secondary !px-3 !py-1.5 text-xs">
            {busy ? "Checking…" : "Verify"}
          </button>
        )}
      </div>
      {!verified && username && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-400">
          <li>
            Add <button type="button" onClick={() => copy(code, "Code copied")} className="rounded bg-teal-500/15 px-1.5 py-0.5 font-mono text-teal-200 hover:bg-teal-500/25" title="Copy">{code}</button> anywhere in {where} and save it.
          </li>
          <li>Click Verify. Once verified you can remove the code.</li>
        </ol>
      )}
    </div>
  );
}

function TrackedLinks({ slug }) {
  const [links, setLinks] = useState(loadLinks);
  const [label, setLabel] = useState("");
  const add = () => {
    const via = viaTag(label);
    if (!via) return;
    const next = [{ label: label.trim(), via }, ...links.filter((l) => l.via !== via)].slice(0, 30);
    setLinks(next);
    try {
      localStorage.setItem(LINKS_KEY, JSON.stringify(next));
    } catch {
      // storage blocked: the list just won't persist
    }
    setLabel("");
    copy(publicUrl(slug, via), "Tracked link copied");
  };
  return (
    <Card title="Tracked links" subtitle="Make a separate link for each application, so Views shows which company opened your resume.">
      <div className="flex gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value.slice(0, 40))}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="e.g. Google SWE application"
          className="input !py-2 text-sm"
        />
        <button type="button" onClick={add} disabled={!viaTag(label)} className="btn-primary !px-4 !py-2 text-sm whitespace-nowrap disabled:opacity-50">
          Create link
        </button>
      </div>
      {links.length > 0 && (
        <ul className="divide-y divide-white/[0.06]">
          {links.map((l) => (
            <li key={l.via} className="flex items-center gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="text-zinc-200">{l.label}</span>{" "}
                <span className="text-xs text-zinc-500">?via={l.via}</span>
              </span>
              <button type="button" onClick={() => copy(publicUrl(slug, l.via))} className="text-xs text-teal-300 hover:underline">Copy</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Card({ title, subtitle, children }) {
  return (
    <section className="space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div>
        <h3 className="font-semibold text-zinc-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm text-zinc-300">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-teal-500" />
    </label>
  );
}

function Status({ ok }) {
  return ok ? (
    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">✓ Verified</span>
  ) : (
    <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-zinc-500">Not verified</span>
  );
}
