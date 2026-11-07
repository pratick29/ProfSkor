"""
Turn an existing resume (PDF text) or a GitHub account into structured e-resume data.

The rule-based parser is best effort: PDFs lose most of their layout when converted to text, so
the user always reviews the result in the editor. When OPENAI_API_KEY is set, an LLM does the
structuring and the rule-based parser is the fallback.
"""
import json
import logging
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

import requests
from pydantic import ValidationError

from config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
from eresume_models import Basics, Education, Experience, Project, ResumeData, clean_url
from resume_service import EMAIL_RE, MAX_LLM_CHARS, TECH_KEYWORDS

log = logging.getLogger(__name__)

SECTION_ALIASES = {
    "summary": ["summary", "profile", "professional summary", "objective", "career objective", "about", "about me"],
    "experience": [
        "experience", "work experience", "professional experience", "employment", "employment history",
        "work history", "internships", "internship", "internship experience",
    ],
    "projects": ["projects", "personal projects", "academic projects", "key projects", "selected projects", "side projects"],
    "education": ["education", "academic background", "academics", "qualifications", "education and training"],
    "skills": [
        "skills", "technical skills", "technologies", "tech stack", "core skills", "skills and tools",
        "tools", "key skills", "technical proficiency",
    ],
    "achievements": [
        "achievements", "awards", "certifications", "certificates", "honors", "honours", "accomplishments",
        "activities", "extracurricular", "extracurricular activities", "leadership", "publications",
        "awards and achievements", "positions of responsibility", "volunteering", "competitions",
    ],
}
HEADING_TO_SECTION = {alias: section for section, aliases in SECTION_ALIASES.items() for alias in aliases}

BULLET_RE = re.compile(r"^\s*(?:[•●▪◦■□►▸‣∙·*\-–—]|\d{1,2}[.)])\s+")
MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
DATE_TOKEN = rf"(?:{MONTH}\s*'?\d{{2,4}}|\d{{1,2}}/\d{{4}}|\d{{4}})"
DATE_RANGE_RE = re.compile(
    rf"({DATE_TOKEN})\s*(?:-|–|—|to|until)\s*({DATE_TOKEN}|present|current|now|ongoing)", re.IGNORECASE
)
SINGLE_DATE_RE = re.compile(rf"\b({MONTH}\s*'?\d{{2,4}}|(?:19|20)\d{{2}})\b", re.IGNORECASE)
URL_RE = re.compile(r"(?:https?://)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:/[^\s,;|)]*)?", re.IGNORECASE)
PHONE_RE = re.compile(r"(\+?\d[\d\s().-]{8,}\d)")
DEGREE_RE = re.compile(
    r"\b(b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|m\.?\s?e\b|b\.?\s?sc|m\.?\s?sc|bachelor|master|ph\.?\s?d|mba|bca|mca|"
    r"b\.?\s?s\b|m\.?\s?s\b|diploma|associate|high school|higher secondary|secondary|class (?:x|xii|10|12))",
    re.IGNORECASE,
)
SCHOOL_RE = re.compile(r"\b(university|college|institute|school|academy|iit|nit|iiit)\b", re.IGNORECASE)
SEPARATORS = re.compile(r"\s+(?:\||–|—|-|@|at)\s+|,\s+", re.IGNORECASE)
TECH_DISPLAY = {
    "javascript": "JavaScript", "typescript": "TypeScript", "postgres": "PostgreSQL", "mongodb": "MongoDB",
    "fastapi": "FastAPI", "pytorch": "PyTorch", "tensorflow": "TensorFlow", "node": "Node.js", "c++": "C++",
    "machine learning": "Machine Learning", "aws": "AWS", "gcp": "GCP", "sql": "SQL", "go": "Go",
}
PROJECT_TECH = [k for k in TECH_KEYWORDS if k not in ("api", "git", "linux")]


def _clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def _heading(line: str) -> Optional[str]:
    """Return the section a line introduces, if it looks like a heading."""
    text = _clean_line(line).rstrip(":").strip().lower()
    text = re.sub(r"[^a-z& ]", "", text).replace("&", "and").strip()
    if not text or len(text) > 40:
        return None
    return HEADING_TO_SECTION.get(text)


def _safe_url(value: str) -> str:
    try:
        return clean_url(value)
    except ValueError:
        return ""


def _split_sections(lines: List[str]) -> Tuple[List[str], Dict[str, List[str]]]:
    header: List[str] = []
    sections: Dict[str, List[str]] = {}
    current: Optional[str] = None
    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            continue
        section = _heading(line)
        if section:
            current = section
            sections.setdefault(section, [])
            continue
        (sections[current] if current else header).append(line)
    return header, sections


def _is_link(url: str, allow_bare_domain: bool = False) -> bool:
    """Real links have a scheme, www. or a path. Bare domains (me.dev) only count in the contact block."""
    lower = url.lower()
    if lower.startswith(("http://", "https://", "www.")) or "/" in lower:
        return True
    return allow_bare_domain and not lower.endswith((".js", ".io", ".net")) and lower.count(".") == 1


def _extract_links(text: str) -> Dict[str, str]:
    links: Dict[str, str] = {}
    text = EMAIL_RE.sub(" ", text)  # so 'jane.doe@x.com' isn't read as the website 'jane.doe'
    for match in URL_RE.finditer(text):
        url = match.group(0).rstrip(".")
        lower = url.lower()
        if "github.com/" in lower and "github" not in links:
            user = re.search(r"github\.com/([A-Za-z0-9-]+)", url, re.IGNORECASE)
            if user:
                links["github"] = user.group(1)
        elif "linkedin.com/" in lower and "linkedin" not in links:
            links["linkedin"] = _safe_url(url)
        elif "leetcode.com/" in lower and "leetcode" not in links:
            user = re.search(r"leetcode\.com/(?:u/)?([A-Za-z0-9_.-]+)", url, re.IGNORECASE)
            if user:
                links["leetcode"] = user.group(1)
        elif "website" not in links and _is_link(url, allow_bare_domain=True):
            if not re.search(r"\.(?:pdf|png|jpg)$", lower):
                links["website"] = _safe_url(url)
    return {k: v for k, v in links.items() if v}


def _parse_basics(header: List[str], full_text: str) -> Basics:
    data: Dict[str, Any] = {}
    candidates = [_clean_line(line) for line in header if _clean_line(line)]
    for line in candidates[:3]:
        if EMAIL_RE.search(line) or URL_RE.fullmatch(line) or PHONE_RE.search(line):
            continue
        words = line.split()
        if 1 <= len(words) <= 5 and len(line) <= 60 and not any(ch.isdigit() for ch in line):
            data["name"] = line.title() if line.isupper() else line
            break
    for line in candidates[1:4]:
        if line == data.get("name") or EMAIL_RE.search(line) or PHONE_RE.search(line) or "http" in line.lower():
            continue
        if 2 <= len(line.split()) <= 14 and len(line) <= 140 and "@" not in line:
            data["headline"] = line
            break
    email = EMAIL_RE.search(full_text)
    if email:
        data["email"] = email.group(0).rstrip(".")
    phone = PHONE_RE.search("\n".join(header) or full_text[:500])
    if phone:
        data["phone"] = re.sub(r"\s+", " ", phone.group(1)).strip()[:40]
    data.update(_extract_links("\n".join(header) or full_text[:800]))
    # location: the plain-text part of a contact line like "me@x.com | +1 555 | Berlin, Germany"
    for line in candidates[1:6]:
        parts = [p.strip() for p in re.split(r"\s*[|•·]\s*", line) if p.strip()]
        if len(parts) < 2:
            continue
        for part in parts:
            if EMAIL_RE.search(part) or PHONE_RE.search(part) or URL_RE.fullmatch(part) or any(c.isdigit() for c in part):
                continue
            if len(part) <= 50 and len(part.split()) <= 5:
                data.setdefault("location", part)
                break
    return _validated(Basics, data) or Basics()


def _validated(model, data: Dict[str, Any]):
    """Build a model, dropping fields that fail validation instead of failing the whole import."""
    try:
        return model(**data)
    except ValidationError as e:
        bad = {err["loc"][0] for err in e.errors() if err.get("loc")}
        try:
            return model(**{k: v for k, v in data.items() if k not in bad})
        except ValidationError:
            return None


def _entries(lines: List[str]) -> List[Dict[str, List[str]]]:
    """Group a section into entries: a run of header lines followed by its bullet points."""
    entries: List[Dict[str, List[str]]] = []
    for line in lines:
        text = _clean_line(line)
        if not text:
            continue
        is_bullet = bool(BULLET_RE.match(line))
        if is_bullet:
            if not entries:
                entries.append({"head": [], "bullets": []})
            entries[-1]["bullets"].append(BULLET_RE.sub("", line).strip())
        elif entries and entries[-1]["bullets"] and text[0].islower():
            entries[-1]["bullets"][-1] += " " + text  # wrapped bullet line
        elif entries and not entries[-1]["bullets"] and len(entries[-1]["head"]) < 3:
            entries[-1]["head"].append(text)
        elif entries and entries[-1]["bullets"] and len(text) > 90:
            entries[-1]["bullets"].append(text)  # a long sentence is a bullet without a marker
        else:
            entries.append({"head": [text], "bullets": []})
    return entries


def _take_dates(text: str) -> Tuple[str, str, str]:
    match = DATE_RANGE_RE.search(text)
    if match:
        rest = (text[:match.start()] + text[match.end():]).strip(" ,|–—-()")
        end = match.group(2)
        return rest, match.group(1).strip(), "Present" if end.lower() in ("present", "current", "now", "ongoing") else end.strip()
    single = SINGLE_DATE_RE.search(text)
    if single:
        rest = (text[:single.start()] + text[single.end():]).strip(" ,|–—-()")
        return rest, "", single.group(1).strip()
    return text, "", ""


def _parse_experience(lines: List[str]) -> List[Experience]:
    items = []
    for entry in _entries(lines):
        head = " | ".join(entry["head"])
        head, start, end = _take_dates(head)
        parts = [p.strip() for p in SEPARATORS.split(head) if p and p.strip()]
        role = parts[0] if parts else ""
        company = parts[1] if len(parts) > 1 else ""
        location = parts[2] if len(parts) > 2 and len(parts[2]) <= 40 else ""
        if not (role or entry["bullets"]):
            continue
        item = _validated(Experience, {
            "role": role[:120], "company": company[:120], "location": location[:80],
            "start": start[:30], "end": end[:30], "bullets": [b[:400] for b in entry["bullets"][:12]],
        })
        if item:
            items.append(item)
    return items[:20]


def _tech_in(text: str, known: List[str]) -> List[str]:
    lower = text.lower()
    found = []
    for skill in known:
        if re.search(rf"(?<![\w+#]){re.escape(skill.lower())}(?![\w+#])", lower) and skill not in found:
            found.append(skill)
    return found[:12]


def _parse_projects(lines: List[str], skills: List[str]) -> List[Project]:
    items = []
    known = skills + [k for k in PROJECT_TECH if k not in {s.lower() for s in skills}]
    for entry in _entries(lines):
        head = " ".join(entry["head"])
        head, _, _ = _take_dates(head)
        links = [m.group(0) for m in URL_RE.finditer(head + " " + " ".join(entry["bullets"])) if _is_link(m.group(0))]
        repo_url = next((_safe_url(u) for u in links if "github.com/" in u.lower()), "")
        demo_url = next((_safe_url(u) for u in links if "github.com/" not in u.lower()), "")
        for url in links:
            head = head.replace(url, "")
        parts = re.split(r"\s+(?:\||–|—|-)\s+|:\s+", head, maxsplit=1)
        name = parts[0].strip(" |,-") if parts else ""
        description = parts[1].strip(" |,-") if len(parts) > 1 else ""
        bullets = [b for b in entry["bullets"] if not URL_RE.fullmatch(b.strip())]
        if not description and bullets:
            description, bullets = bullets[0], bullets[1:]
        tech = _tech_in(" ".join([head, description] + entry["bullets"]), known)
        tech = [t if t in skills else TECH_DISPLAY.get(t, t.title() if len(t) > 3 else t.upper()) for t in tech]
        repo = re.search(r"github\.com/([A-Za-z0-9-]+/[A-Za-z0-9._-]+)", repo_url or "", re.IGNORECASE)
        if not name:
            continue
        item = _validated(Project, {
            "name": name[:120], "description": description[:400], "tech": tech, "repo_url": repo_url,
            "demo_url": demo_url, "repo": repo.group(1) if repo else "", "bullets": [b[:400] for b in bullets[:10]],
        })
        if item:
            items.append(item)
    return items[:20]


def _parse_education(lines: List[str]) -> List[Education]:
    items = []
    for entry in _entries(lines):
        texts = entry["head"] + entry["bullets"]
        joined = " | ".join(texts)
        rest, start, end = _take_dates(joined)
        # "B.Tech in CS, Some College" holds both, so look at the comma/pipe separated parts first
        parts = [p.strip() for t in texts for p in re.split(r",\s+|\s+[|–—-]\s+|\s*\|\s*", t) if p.strip()]
        school = next((p for p in parts if SCHOOL_RE.search(p) and not DEGREE_RE.search(p)), "") or next(
            (t for t in texts if SCHOOL_RE.search(t)), "")
        degree = next((p for p in parts if DEGREE_RE.search(p) and p != school), "")
        if not school and not degree:
            school = texts[0] if texts else ""
        details = [t for t in texts if (not school or school not in t) and (not degree or degree not in t)]
        clean = lambda s: _take_dates(s)[0].strip(" |,")  # noqa: E731
        item = _validated(Education, {
            "school": clean(school)[:140], "degree": clean(degree)[:140], "start": start[:30], "end": end[:30],
            "details": clean(" · ".join(details))[:400],
        })
        if item and (item.school or item.degree):
            items.append(item)
    return items[:10]


def _parse_skills(lines: List[str]) -> List[str]:
    skills: List[str] = []
    for line in lines:
        text = BULLET_RE.sub("", line)
        if ":" in text:
            text = text.split(":", 1)[1]  # "Languages: Python, Go" -> "Python, Go"
        for token in re.split(r"[,|;•·/]|\s{2,}|\t", text):
            token = token.strip(" .-–")
            if 1 <= len(token) <= 40 and len(token.split()) <= 4 and token.lower() not in {s.lower() for s in skills}:
                skills.append(token)
    return skills[:60]


def _parse_list(lines: List[str]) -> List[str]:
    items: List[str] = []
    for line in lines:
        text = _clean_line(BULLET_RE.sub("", line))
        if not text:
            continue
        if items and not BULLET_RE.match(line) and text[0].islower():
            items[-1] = (items[-1] + " " + text)[:400]
        else:
            items.append(text[:400])
    return items[:20]


def parse_resume_rules(text: str) -> ResumeData:
    lines = text.replace("\r", "\n").split("\n")
    header, sections = _split_sections(lines)
    basics = _parse_basics(header, text)
    skills = _parse_skills(sections.get("skills", []))
    summary = " ".join(_clean_line(line) for line in sections.get("summary", []))
    if summary:
        basics = basics.model_copy(update={"summary": summary[:1500]})
    return ResumeData(
        basics=basics,
        skills=skills,
        experience=_parse_experience(sections.get("experience", [])),
        projects=_parse_projects(sections.get("projects", []), skills),
        education=_parse_education(sections.get("education", [])),
        achievements=_parse_list(sections.get("achievements", [])),
    )


LLM_IMPORT_PROMPT = """Convert this resume into JSON. Return ONLY a JSON object with exactly these keys:
{"basics": {"name", "headline", "email", "phone", "location", "summary", "website", "linkedin", "github", "leetcode"},
 "skills": [string],
 "experience": [{"role", "company", "location", "start", "end", "link", "bullets": [string]}],
 "projects": [{"name", "description", "tech": [string], "repo_url", "demo_url", "bullets": [string]}],
 "education": [{"school", "degree", "start", "end", "details"}],
 "achievements": [string]}
Rules: copy the candidate's own wording; do not invent anything. Use "" for unknown values.
"github" and "leetcode" are usernames only. Links must be full URLs. Dates like "Jan 2024" or "2024"; use "Present" for ongoing roles.
"headline" is a short title such as "Backend Engineer" if the resume states one."""


def parse_resume_llm(text: str) -> Optional[ResumeData]:
    if not OPENAI_API_KEY:
        return None
    try:
        res = requests.post(
            f"{OPENAI_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={
                "model": OPENAI_MODEL,
                "response_format": {"type": "json_object"},
                "temperature": 0,
                "messages": [
                    {"role": "system", "content": LLM_IMPORT_PROMPT},
                    {"role": "user", "content": text[:MAX_LLM_CHARS]},
                ],
            },
            timeout=60,
        )
        res.raise_for_status()
        raw = json.loads(res.json()["choices"][0]["message"]["content"])
    except Exception:
        log.exception("LLM resume import failed; falling back to rule-based parser")
        return None
    return coerce_resume(raw)


def coerce_resume(raw: Any) -> Optional[ResumeData]:
    """Validate untrusted structured data item by item, keeping whatever is valid."""
    if not isinstance(raw, dict):
        return None

    def items(key, model, limit):
        out = []
        for value in (raw.get(key) or [])[:limit] if isinstance(raw.get(key), list) else []:
            if isinstance(value, dict):
                value = {k: (v[:400] if isinstance(v, str) else v) for k, v in value.items()}
                for list_key in ("bullets", "tech"):
                    if isinstance(value.get(list_key), list):
                        value[list_key] = [str(x)[:400 if list_key == "bullets" else 40] for x in value[list_key][:10]]
                item = _validated(model, value)
                if item:
                    out.append(item)
        return out

    def strings(key, limit, max_len):
        values = raw.get(key) if isinstance(raw.get(key), list) else []
        return [str(v).strip()[:max_len] for v in values[:limit] if str(v).strip()]

    basics_raw = raw.get("basics") if isinstance(raw.get("basics"), dict) else {}
    basics_raw = {k: str(v) for k, v in basics_raw.items() if isinstance(v, (str, int, float))}
    return ResumeData(
        basics=_validated(Basics, basics_raw) or Basics(),
        skills=strings("skills", 60, 40),
        experience=items("experience", Experience, 20),
        projects=items("projects", Project, 20),
        education=items("education", Education, 10),
        achievements=strings("achievements", 20, 400),
    )


def parse_resume_text(text: str) -> Tuple[ResumeData, str]:
    llm = parse_resume_llm(text)
    if llm and (llm.basics.name or llm.experience or llm.projects):
        return llm, "ai"
    return parse_resume_rules(text), "rules"


def resume_from_github(user: Dict[str, Any], repos: List[Dict[str, Any]], max_projects: int = 6) -> ResumeData:
    """Starter resume from a GitHub account: best original repos become projects with evidence links."""
    originals = [r for r in repos if not r.get("fork") and not r.get("archived")]
    originals.sort(key=lambda r: (r.get("stargazers_count", 0), r.get("pushed_at") or ""), reverse=True)
    projects = []
    for repo in originals[:max_projects]:
        tech = ([repo["language"]] if repo.get("language") else []) + [
            t for t in (repo.get("topics") or []) if t.lower() != (repo.get("language") or "").lower()
        ][:5]
        item = _validated(Project, {
            "name": repo.get("name", "")[:120],
            "description": (repo.get("description") or "")[:400],
            "tech": [t[:40] for t in tech],
            "repo_url": repo.get("html_url") or "",
            "demo_url": repo.get("homepage") or "",
            "repo": repo.get("full_name") or "",
        })
        if item:
            projects.append(item)
    languages = Counter(r["language"] for r in originals if r.get("language"))
    basics = _validated(Basics, {
        "name": (user.get("name") or "")[:80],
        "summary": (user.get("bio") or "")[:1500],
        "location": (user.get("location") or "")[:80],
        "website": user.get("blog") or "",
        "github": user.get("login") or "",
        "email": user.get("email") or "",
    }) or Basics()
    return ResumeData(basics=basics, skills=[lang for lang, _ in languages.most_common(8)], projects=projects)
