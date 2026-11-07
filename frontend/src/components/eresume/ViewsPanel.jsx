import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/client";
import { SECTION_LABELS, formatDuration, timeAgo } from "../../utils/eresume";
import { Card } from "./PublishPanel";

const CLICK_LABELS = {
  email: "Email", phone: "Phone", website: "Website", linkedin: "LinkedIn", github: "GitHub profile",
  leetcode: "LeetCode profile", company: "Company link", repo: "Project code", demo: "Project demo",
  skill: "Skill", proof: "Verified stats", download: "Downloaded PDF", copy: "Copied link",
};

export default function ViewsPanel({ published }) {
  const [days, setDays] = useState(30);
  const [result, setResult] = useState({ days: null, stats: null, error: null });

  useEffect(() => {
    let cancelled = false;
    api
      .get("/eresume/me/views", { params: { days } })
      .then((res) => !cancelled && setResult({ days, stats: res.data, error: null }))
      .catch((e) => !cancelled && setResult({ days, stats: null, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const loading = result.days !== days;
  const stats = result.stats;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          Views are anonymous: no cookies, and your own visits don't count.
        </p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input !w-auto !py-1.5 text-sm">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {result.error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">{result.error}</p>}
      {loading && !stats && <p className="text-sm text-zinc-500">Loading…</p>}

      {stats && (
        <>
          <div className={`grid grid-cols-2 gap-3 md:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
            <Stat label="Views" value={stats.total} />
            <Stat label="Unique visitors" value={stats.unique} />
            <Stat label="Read for 15s+" value={stats.engaged} />
            <Stat label="Avg. time on page" value={formatDuration(stats.avg_duration_ms)} />
          </div>

          {stats.total === 0 ? (
            <Card title="No views yet">
              <p className="text-sm text-zinc-400">
                {published
                  ? "Share your link, or create a tracked link per application in Publish, and views will show up here."
                  : "Publish your e-resume first, then share the link."}
              </p>
            </Card>
          ) : (
            <>
              <Card title="Views per day">
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.by_day} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                      <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
                      <YAxis allowDecimals={false} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        contentStyle={{ background: "#111118", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                        labelStyle={{ color: "#a1a1aa" }}
                      />
                      <Bar dataKey="views" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                <Card title="Tracked links" subtitle="Which application each view came from">
                  {stats.by_link.length ? <Rows rows={stats.by_link.map((r) => [r.name, `${r.views} view${r.views > 1 ? "s" : ""}`])} /> : <Empty text="No views from tracked links yet." />}
                </Card>
                <Card title="Referrers" subtitle="The site the visitor came from">
                  <Rows rows={stats.by_referrer.map((r) => [r.name, `${r.views}`])} />
                </Card>
                <Card title="What they read" subtitle="Share of views that reached each section">
                  {Object.keys(stats.sections).filter((k) => SECTION_LABELS[k]).length ? (
                    <div className="space-y-2">
                      {Object.entries(stats.sections)
                        .filter(([k]) => SECTION_LABELS[k])
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, pct]) => (
                          <div key={k}>
                            <div className="flex justify-between text-xs text-zinc-400">
                              <span>{SECTION_LABELS[k]}</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-white/5">
                              <div className="h-1.5 rounded-full bg-teal-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : <Empty text="Not enough data yet." />}
                </Card>
                <Card title="What they clicked">
                  {stats.clicks.length ? (
                    <Rows rows={stats.clicks.map((c) => [`${CLICK_LABELS[c.kind] || c.kind}${["repo", "demo", "skill", "company", "website"].includes(c.kind) ? `: ${c.target.replace(/^https?:\/\/(www\.)?/, "")}` : ""}`, `${c.count}×`])} />
                  ) : <Empty text="No clicks yet." />}
                </Card>
              </div>

              <Card title="Recent views">
                <ul className="divide-y divide-white/[0.06] text-sm">
                  {stats.recent.map((v, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                      <span className="w-28 text-zinc-300">{timeAgo(v.viewed_at)}</span>
                      <span className="flex-1 text-zinc-400">
                        {v.via ? <span className="rounded bg-teal-500/15 px-1.5 py-0.5 text-xs text-teal-200">{v.via}</span> : v.referrer || "Direct"}
                      </span>
                      <span className="text-zinc-400">{formatDuration(v.duration_ms)}</span>
                      <span className="text-xs text-zinc-500">
                        {v.sections.filter((s) => SECTION_LABELS[s]).length} sections · {v.clicks} click{v.clicks === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function Rows({ rows }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map(([name, value], i) => (
        <li key={i} className="flex justify-between gap-3">
          <span className="truncate text-zinc-300">{name}</span>
          <span className="shrink-0 tabular-nums text-zinc-500">{value}</span>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }) {
  return <p className="text-sm text-zinc-500">{text}</p>;
}
