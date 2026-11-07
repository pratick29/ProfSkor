import { useState } from "react";
import { emptyEducation, emptyExperience, emptyProject, normalizeUrl, usernameFrom } from "../../utils/eresume";

/** Section-by-section editor for the resume data. `update(fn)` receives the previous data and returns the next. */
export default function EditorForm({ data, update }) {
  const setBasics = (key, value) => update((d) => ({ ...d, basics: { ...d.basics, [key]: value } }));
  const setList = (key, fn) => update((d) => ({ ...d, [key]: fn(d[key]) }));
  const b = data.basics;

  return (
    <div className="space-y-4">
      <Panel title="Basics" defaultOpen>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" value={b.name} onChange={(v) => setBasics("name", v)} placeholder="Priya Sharma" maxLength={80} />
          <Field label="Headline" value={b.headline} onChange={(v) => setBasics("headline", v)} placeholder="Backend Engineer · Python, AWS" maxLength={140} />
          <Field label="Email" type="email" value={b.email} onChange={(v) => setBasics("email", v)} placeholder="you@example.com" maxLength={120} />
          <Field label="Phone" value={b.phone} onChange={(v) => setBasics("phone", v)} placeholder="+91 98765 43210" maxLength={40} />
          <Field label="Location" value={b.location} onChange={(v) => setBasics("location", v)} placeholder="Bengaluru, India" maxLength={80} />
          <UrlField label="Website / portfolio" value={b.website} onChange={(v) => setBasics("website", v)} placeholder="yourname.dev" />
          <UrlField label="LinkedIn" value={b.linkedin} onChange={(v) => setBasics("linkedin", v)} placeholder="linkedin.com/in/you" />
          <Field
            label="GitHub username"
            value={b.github}
            onChange={(v) => setBasics("github", v)}
            onBlur={() => setBasics("github", usernameFrom(b.github, "github.com"))}
            placeholder="octocat"
            hint="Verify it in Publish to show live stats"
            maxLength={200}
          />
          <Field
            label="LeetCode username"
            value={b.leetcode}
            onChange={(v) => setBasics("leetcode", v)}
            onBlur={() => setBasics("leetcode", usernameFrom(b.leetcode, "leetcode.com"))}
            placeholder="optional"
            maxLength={200}
          />
        </div>
        <Area
          label="Summary"
          value={b.summary}
          onChange={(v) => setBasics("summary", v)}
          rows={4}
          maxLength={1500}
          placeholder="2-3 sentences: what you build, what you're good at, what you're looking for."
        />
      </Panel>

      <Panel title="Skills" count={data.skills.length} defaultOpen>
        <TagInput values={data.skills} onChange={(skills) => update((d) => ({ ...d, skills }))} placeholder="Type a skill and press Enter, or paste a comma-separated list" />
        <p className="mt-2 text-xs text-zinc-500">
          Skills that also appear in a project's tech list (or your verified GitHub languages) get an evidence marker on the public page.
        </p>
      </Panel>

      <Panel title="Experience" count={data.experience.length} defaultOpen={data.experience.length > 0}>
        <ItemList
          items={data.experience}
          onChange={(fn) => setList("experience", fn)}
          make={emptyExperience}
          addLabel="Add a job or internship"
          titleOf={(e) => [e.role, e.company].filter(Boolean).join(" · ") || "New role"}
          render={(item, set) => (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Role" value={item.role} onChange={(v) => set("role", v)} placeholder="Software Engineer Intern" maxLength={120} />
                <Field label="Company" value={item.company} onChange={(v) => set("company", v)} placeholder="Acme" maxLength={120} />
                <Field label="Start" value={item.start} onChange={(v) => set("start", v)} placeholder="Jan 2024" maxLength={30} />
                <Field label="End" value={item.end} onChange={(v) => set("end", v)} placeholder="Present" maxLength={30} />
                <Field label="Location" value={item.location} onChange={(v) => set("location", v)} placeholder="Remote" maxLength={80} />
                <UrlField label="Company link" value={item.link} onChange={(v) => set("link", v)} placeholder="optional" />
              </div>
              <LinesArea
                label="What you did (one point per line)"
                value={item.bullets}
                onChange={(v) => set("bullets", v)}
                placeholder={"Built a payments dashboard used by 40 analysts\nCut report time by 60% with materialized views"}
              />
            </>
          )}
        />
      </Panel>

      <Panel title="Projects" count={data.projects.length} defaultOpen={data.projects.length > 0}>
        <ItemList
          items={data.projects}
          onChange={(fn) => setList("projects", fn)}
          make={emptyProject}
          addLabel="Add a project"
          titleOf={(p) => p.name || "New project"}
          render={(item, set) => (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" value={item.name} onChange={(v) => set("name", v)} placeholder="ProfSkor" maxLength={120} />
                <Field
                  label="Tech (comma-separated)"
                  value={item.tech.join(", ")}
                  onChange={(v) => set("tech", v.split(",").map((t) => t.trimStart()).slice(0, 15))}
                  placeholder="React, FastAPI, Postgres"
                />
                <UrlField
                  label="Code link"
                  value={item.repo_url}
                  onChange={(v) => {
                    set("repo_url", v);
                    const repo = v.match(/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)/i)?.[1]?.replace(/\.git$/, "") || "";
                    set("repo", repo);
                  }}
                  placeholder="github.com/you/project"
                  hint={item.repo ? "Live stars and last commit show once your GitHub is verified" : undefined}
                />
                <UrlField label="Live demo" value={item.demo_url} onChange={(v) => set("demo_url", v)} placeholder="optional" />
              </div>
              <Area label="One-line description" value={item.description} onChange={(v) => set("description", v)} rows={2} maxLength={400} placeholder="What it is and who it's for" />
              <LinesArea label="Highlights (one per line)" value={item.bullets} onChange={(v) => set("bullets", v)} placeholder="Used by 300 students; 42 GitHub stars" />
            </>
          )}
        />
      </Panel>

      <Panel title="Education" count={data.education.length} defaultOpen={data.education.length > 0}>
        <ItemList
          items={data.education}
          onChange={(fn) => setList("education", fn)}
          make={emptyEducation}
          addLabel="Add education"
          titleOf={(e) => e.school || e.degree || "New entry"}
          render={(item, set) => (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="School" value={item.school} onChange={(v) => set("school", v)} placeholder="RV College of Engineering" maxLength={140} />
              <Field label="Degree" value={item.degree} onChange={(v) => set("degree", v)} placeholder="B.Tech, Computer Science" maxLength={140} />
              <Field label="Start" value={item.start} onChange={(v) => set("start", v)} placeholder="2020" maxLength={30} />
              <Field label="End" value={item.end} onChange={(v) => set("end", v)} placeholder="2024" maxLength={30} />
              <div className="sm:col-span-2">
                <Field label="Details" value={item.details} onChange={(v) => set("details", v)} placeholder="CGPA 8.7/10 · Coursework: Distributed Systems" maxLength={400} />
              </div>
            </div>
          )}
        />
      </Panel>

      <Panel title="Achievements" count={data.achievements.filter(Boolean).length} defaultOpen={data.achievements.length > 0}>
        <LinesArea
          label="Awards, certifications, hackathons (one per line)"
          value={data.achievements}
          onChange={(achievements) => update((d) => ({ ...d, achievements: achievements.slice(0, 20) }))}
          placeholder={"Winner, Smart India Hackathon 2023\nAWS Certified Developer"}
        />
      </Panel>
    </div>
  );
}

function Panel({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-zinc-100">
          {title}
          {count > 0 && <span className="ml-2 text-xs font-normal text-zinc-500">{count}</span>}
        </span>
        <span className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {open && <div className="space-y-3 px-5 pb-5">{children}</div>}
    </section>
  );
}

export function Field({ label, value, onChange, onBlur, placeholder, type = "text", hint, error, maxLength }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`input mt-1 !py-2 text-sm ${error ? "!border-red-500/60" : ""}`}
      />
      {error ? <span className="mt-1 block text-xs text-red-400">{error}</span> : hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

function UrlField({ value, onChange, ...props }) {
  const { url, error } = normalizeUrl(value);
  return (
    <Field
      {...props}
      value={value}
      onChange={onChange}
      onBlur={() => !error && url !== value && onChange(url)}
      error={value && error ? error : null}
      maxLength={300}
    />
  );
}

function Area({ label, value, onChange, rows = 3, placeholder, maxLength }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="input mt-1 !py-2 text-sm resize-y"
      />
    </label>
  );
}

/** A list of strings edited as lines of text. Blank lines are kept while typing and dropped on save. */
function LinesArea({ label, value, onChange, placeholder }) {
  const lines = value || [];
  return (
    <Area
      label={label}
      value={lines.join("\n")}
      onChange={(text) => onChange(text.split("\n").slice(0, 12).map((l) => l.slice(0, 400)))}
      rows={Math.min(Math.max(lines.length + 1, 3), 10)}
      placeholder={placeholder}
    />
  );
}

function TagInput({ values, onChange, placeholder }) {
  const [draft, setDraft] = useState("");
  const add = (text) => {
    const incoming = text.split(/[,\n;|]/).map((t) => t.trim().slice(0, 40)).filter(Boolean);
    if (!incoming.length) return;
    const seen = new Set(values.map((v) => v.toLowerCase()));
    const next = [...values];
    for (const tag of incoming) {
      if (!seen.has(tag.toLowerCase())) {
        seen.add(tag.toLowerCase());
        next.push(tag);
      }
    }
    onChange(next.slice(0, 60));
    setDraft("");
  };
  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2 focus-within:border-teal-500">
      {values.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-teal-500/15 px-2 py-1 text-sm text-teal-200">
          {tag}
          <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(values.filter((v) => v !== tag))} className="text-teal-300/70 hover:text-white">
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => (/[,;\n]/.test(e.target.value) ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        placeholder={values.length ? "Add more…" : placeholder}
        className="min-w-[10rem] flex-1 bg-transparent px-1 py-1 text-sm text-white outline-none placeholder:text-zinc-500"
      />
    </div>
  );
}

function ItemList({ items, onChange, make, addLabel, titleOf, render }) {
  const [openId, setOpenId] = useState(null);
  const move = (index, delta) =>
    onChange((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const open = openId === item.id;
        const set = (key, value) => onChange((list) => list.map((x) => (x.id === item.id ? { ...x, [key]: value } : x)));
        return (
          <div key={item.id} className="rounded-xl border border-white/[0.06] bg-black/20">
            <div className="flex items-center gap-2 px-3 py-2">
              <button type="button" onClick={() => setOpenId(open ? null : item.id)} className="flex-1 truncate text-left text-sm font-medium text-zinc-200">
                {titleOf(item)}
              </button>
              <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</IconButton>
              <IconButton label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</IconButton>
              <IconButton label="Remove" onClick={() => onChange((list) => list.filter((x) => x.id !== item.id))}>✕</IconButton>
            </div>
            {open && <div className="space-y-3 border-t border-white/[0.06] p-3">{render(item, set)}</div>}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => {
          const item = make();
          onChange((list) => [...list, item]);
          setOpenId(item.id);
        }}
        className="w-full rounded-xl border border-dashed border-white/10 py-2.5 text-sm text-zinc-400 hover:border-teal-500/40 hover:text-teal-300"
      >
        + {addLabel}
      </button>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="h-7 w-7 rounded-lg text-xs text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
