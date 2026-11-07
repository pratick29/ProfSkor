import { useState } from "react";
import { dateRange, displayUrl, githubUrl, leetcodeUrl, skillEvidence, timeAgo } from "../../utils/eresume";

/**
 * The resume document itself. Used for the live preview in the editor and for the public page,
 * and styled to print cleanly to PDF. Light theme on purpose: it's a document, not app chrome.
 */
export default function ResumeView({ data, verified = {}, evidence = {}, liveUrl = "", onTrack, preview = false }) {
  const [openSkill, setOpenSkill] = useState(null);
  const b = data.basics || {};
  const track = (kind, target) => onTrack?.(kind, target);
  const gh = evidence.github;
  const lc = evidence.leetcode;
  const repoStats = (project) => (project.repo && gh?.repo_stats?.[project.repo.toLowerCase()]) || null;

  const skills = (data.skills || []).map((skill) => ({ skill, ev: skillEvidence(skill, data, evidence) }));
  const backed = (ev) => ev.projects.length > 0 || ev.jobs.length > 0 || ev.repos > 0;
  const selected = skills.find((s) => s.skill === openSkill);

  return (
    <article className="resume-doc bg-white text-slate-800 w-full max-w-[850px] mx-auto px-6 py-8 sm:px-12 sm:py-12 print:p-0 print:max-w-none text-[15px] leading-relaxed">
      <header data-section="header">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 break-words">
          {b.name || (preview ? <span className="text-slate-300">Your Name</span> : "")}
        </h1>
        {b.headline && <p className="mt-1 text-lg font-medium text-teal-700">{b.headline}</p>}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-600">
          {b.location && <li>{b.location}</li>}
          {b.email && (
            <li className="flex items-center gap-1.5">
              <Link href={`mailto:${b.email}`} onClick={() => track("email", "email")}>{b.email}</Link>
              {verified.email && <Verified title="Matches the confirmed email on the owner's ProfSkor account" />}
            </li>
          )}
          {b.phone && <li><Link href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} onClick={() => track("phone", "phone")}>{b.phone}</Link></li>}
          {b.website && <li><Link href={b.website} onClick={() => track("website", b.website)}>{displayUrl(b.website)}</Link></li>}
          {b.linkedin && <li><Link href={b.linkedin} onClick={() => track("linkedin", b.linkedin)}>LinkedIn</Link></li>}
          {b.github && (
            <li className="flex items-center gap-1.5">
              <Link href={githubUrl(b.github)} onClick={() => track("github", "github")}>github.com/{b.github}</Link>
              {verified.github && <Verified title={`Account ownership verified ${timeAgo(verified.github.verified_at)}`} />}
            </li>
          )}
          {b.leetcode && (
            <li className="flex items-center gap-1.5">
              <Link href={leetcodeUrl(b.leetcode)} onClick={() => track("leetcode", "leetcode")}>LeetCode</Link>
              {verified.leetcode && <Verified title={`Account ownership verified ${timeAgo(verified.leetcode.verified_at)}`} />}
            </li>
          )}
        </ul>
      </header>

      {(gh || lc) && (
        <section data-section="proof" className="mt-6 break-inside-avoid">
          <div className={`grid gap-3 ${gh && lc ? "sm:grid-cols-2 print:grid-cols-2" : ""}`}>
            {gh && (
              <ProofCard
                title="GitHub"
                href={gh.url}
                handle={`@${gh.username}`}
                onClick={() => track("proof", "github")}
                stats={[
                  ["Original repos", gh.repos],
                  ["Stars earned", gh.stars],
                  gh.contributions != null ? ["Contributions, last year", gh.contributions] : null,
                  gh.member_since ? ["On GitHub since", gh.member_since] : null,
                ]}
                footer={Object.keys(gh.languages || {}).slice(0, 6).join(" · ")}
              />
            )}
            {lc && (
              <ProofCard
                title="LeetCode"
                href={lc.url}
                handle={`@${lc.username}`}
                onClick={() => track("proof", "leetcode")}
                stats={[
                  ["Problems solved", lc.solved],
                  ["Medium / Hard", `${lc.medium} / ${lc.hard}`],
                  lc.contest_rating ? ["Contest rating", lc.contest_rating] : null,
                  lc.contest_top_percent ? ["Contest rank", `Top ${lc.contest_top_percent}%`] : ["Max streak", `${lc.streak} days`],
                ]}
              />
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Pulled live from the verified accounts{evidence.checked_at ? `, checked ${timeAgo(evidence.checked_at)}` : ""}. Not typed in by the candidate.
          </p>
        </section>
      )}

      {b.summary && (
        <Section id="summary" title="Summary">
          <p className="whitespace-pre-line">{b.summary}</p>
        </Section>
      )}

      {skills.length > 0 && (
        <Section id="skills" title="Skills">
          <div className="flex flex-wrap gap-1.5">
            {skills.map(({ skill, ev }) => (
              <button
                type="button"
                key={skill}
                onClick={() => {
                  setOpenSkill(openSkill === skill ? null : skill);
                  if (openSkill !== skill) track("skill", skill);
                }}
                title={backed(ev) ? "Show where this skill is used" : undefined}
                className={`rounded-md border px-2 py-0.5 text-sm transition-colors ${
                  openSkill === skill
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
                }`}
              >
                {skill}
                {backed(ev) && <span aria-label="backed by evidence" className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-teal-500 align-middle" />}
              </button>
            ))}
          </div>
          {selected && (
            <p className="mt-2 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-900 print:hidden">
              <strong>{selected.skill}:</strong>{" "}
              {backed(selected.ev)
                ? [
                    selected.ev.projects.length ? `used in ${selected.ev.projects.join(", ")}` : null,
                    selected.ev.jobs.length ? `at work: ${selected.ev.jobs.join(", ")}` : null,
                    selected.ev.repos ? `main language of ${selected.ev.repos} public GitHub repo${selected.ev.repos > 1 ? "s" : ""}` : null,
                  ].filter(Boolean).join(" · ")
                : "listed by the candidate; not linked to a project on this page."}
            </p>
          )}
          {skills.some(({ ev }) => backed(ev)) && (
            <p className="mt-1.5 text-xs text-slate-500 print:hidden">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-teal-500 align-middle" />
              backed by a project, job or GitHub repo on this page. Tap a skill to see where.
            </p>
          )}
        </Section>
      )}

      {data.experience?.length > 0 && (
        <Section id="experience" title="Experience">
          <div className="space-y-5">
            {data.experience.map((job) => (
              <div key={job.id} className="break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <h3 className="font-semibold text-slate-900">
                    {job.role}
                    {job.company && (
                      <span className="font-normal text-slate-600">
                        {job.role ? " · " : ""}
                        {job.link ? <Link href={job.link} onClick={() => track("company", job.link)}>{job.company}</Link> : job.company}
                      </span>
                    )}
                  </h3>
                  <span className="text-sm text-slate-500 tabular-nums">{dateRange(job.start, job.end)}</span>
                </div>
                {job.location && <p className="text-sm text-slate-500">{job.location}</p>}
                <Bullets items={job.bullets} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.projects?.length > 0 && (
        <Section id="projects" title="Projects">
          <div className="space-y-5">
            {data.projects.map((project) => {
              const stats = repoStats(project);
              return (
                <div key={project.id} className="break-inside-avoid">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                      {project.name}
                      {stats && !stats.fork && <Verified label="Verified repo" title="This repository belongs to the candidate's verified GitHub account" />}
                    </h3>
                    <div className="flex gap-3 text-sm">
                      {project.repo_url && <Link href={project.repo_url} onClick={() => track("repo", project.repo_url)}>Code ↗</Link>}
                      {project.demo_url && <Link href={project.demo_url} onClick={() => track("demo", project.demo_url)}>Live demo ↗</Link>}
                    </div>
                  </div>
                  {stats && (
                    <p className="text-xs text-slate-500">
                      ★ {stats.stars.toLocaleString()} stars · {stats.forks.toLocaleString()} forks{stats.language ? ` · ${stats.language}` : ""}
                      {stats.pushed_at ? ` · last commit ${timeAgo(stats.pushed_at)}` : ""}
                    </p>
                  )}
                  {project.description && <p className="mt-1">{project.description}</p>}
                  <Bullets items={project.bullets} />
                  {project.tech?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {project.tech.map((t) => (
                        <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {data.education?.length > 0 && (
        <Section id="education" title="Education">
          <div className="space-y-3">
            {data.education.map((ed) => (
              <div key={ed.id} className="break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <h3 className="font-semibold text-slate-900">{ed.school}</h3>
                  <span className="text-sm text-slate-500 tabular-nums">{dateRange(ed.start, ed.end)}</span>
                </div>
                {ed.degree && <p>{ed.degree}</p>}
                {ed.details && <p className="text-sm text-slate-600">{ed.details}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.achievements?.length > 0 && (
        <Section id="achievements" title="Achievements">
          <Bullets items={data.achievements} />
        </Section>
      )}

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
        {liveUrl ? (
          <span>
            Live, verified version: <Link href={liveUrl}>{displayUrl(liveUrl)}</Link>
          </span>
        ) : (
          <span>{preview ? "Publish to get a live link recruiters can open." : ""}</span>
        )}
        <span>Built with ProfSkor</span>
      </footer>
    </article>
  );
}

function Section({ id, title, children }) {
  return (
    <section data-section={id} className="mt-7">
      <h2 className="mb-3 border-b border-slate-200 pb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-teal-700">{title}</h2>
      {children}
    </section>
  );
}

function Bullets({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-1.5 list-disc space-y-1 pl-5 marker:text-slate-400">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

function Link({ href, onClick, children }) {
  const external = /^https?:/i.test(href);
  return (
    <a
      href={href}
      onClick={onClick}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-teal-700 hover:decoration-teal-500"
    >
      {children}
    </a>
  );
}

function Verified({ label = "Verified", title }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200"
    >
      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
        <path d="M6.5 11.2 3.3 8l1.1-1.1 2.1 2.1 5.1-5.1L12.7 5z" />
      </svg>
      {label}
    </span>
  );
}

function ProofCard({ title, handle, href, stats, footer, onClick }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {title} <Verified />
        </span>
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className="text-xs text-slate-500 hover:text-teal-700">
          {handle} ↗
        </a>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {stats.filter(Boolean).map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="text-base font-semibold tabular-nums text-slate-900">{typeof value === "number" ? value.toLocaleString() : value}</dd>
          </div>
        ))}
      </dl>
      {footer && <p className="mt-2 text-xs text-slate-500">{footer}</p>}
    </div>
  );
}
