import json
import logging
import re
from typing import Dict, List, Optional

import requests
from pypdf import PdfReader

from config import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL

log = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
MAX_LLM_CHARS = 15000

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(\+?\d[\d\s().-]{8,}\d)")
METRIC_RE = re.compile(r"\b\d+(\.\d+)?\s?(%|x\b|k\b|users|customers|ms\b|hours|million|percent)", re.IGNORECASE)
ACTION_VERBS = [
    "built", "designed", "led", "developed", "implemented", "launched", "improved", "reduced",
    "increased", "optimized", "automated", "created", "shipped", "migrated", "architected", "mentored",
]
TECH_KEYWORDS = [
    "python", "javascript", "typescript", "java", "c++", "go", "rust", "react", "node", "sql",
    "postgres", "mongodb", "aws", "gcp", "azure", "docker", "kubernetes", "api", "git", "linux",
    "machine learning", "pytorch", "tensorflow", "fastapi", "django", "spring",
]


def extract_text_from_pdf(file_obj) -> str:
    reader = PdfReader(file_obj)
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _has_section(lower_text: str, names: List[str]) -> bool:
    return any(re.search(rf"(^|\n)\s*{re.escape(n)}\b", lower_text) for n in names)


def analyze_resume_rules(text: str, job_description: str = "") -> Dict:
    """Deterministic resume checks. Always available, and used as the fallback for the LLM review."""
    lower = text.lower()
    word_count = len(text.split())
    has_email = bool(EMAIL_RE.search(text))
    has_phone = bool(PHONE_RE.search(text))
    has_github = "github.com" in lower
    has_linkedin = "linkedin.com" in lower
    has_experience = _has_section(lower, ["experience", "work experience", "employment", "internship"])
    has_projects = _has_section(lower, ["projects", "personal projects", "academic projects"])
    has_education = _has_section(lower, ["education"]) or any(k in lower for k in ["university", "b.tech", "bachelor", "degree"])
    has_skills = _has_section(lower, ["skills", "technical skills", "technologies"])
    metrics = len(METRIC_RE.findall(text))
    verbs = sum(1 for v in ACTION_VERBS if re.search(rf"\b{v}\b", lower))
    tech_found = [k for k in TECH_KEYWORDS if re.search(rf"(?<![\w+]){re.escape(k)}(?![\w+])", lower)]

    checks = [
        (has_email, 8, "Email address present", "Missing email address", "Add a professional email address at the top."),
        (has_phone, 4, "Phone number present", None, "Add a phone number."),
        (has_github, 8, "GitHub profile linked", "No GitHub link", "Add your GitHub URL so reviewers can see your code."),
        (has_linkedin, 5, "LinkedIn profile linked", None, "Add your LinkedIn URL."),
        (has_experience, 15, "Experience section present", "No experience or internship section", "Add an Experience section, even internships or freelance work."),
        (has_projects, 15, "Projects section present", "No projects section", "Add 2-3 projects with what you built, the stack, and the result."),
        (has_education, 8, "Education section present", "Missing education", "Add your education details."),
        (has_skills, 10, "Skills section present", "No skills section", "Add a Skills section grouped by languages, frameworks, and tools."),
        (metrics >= 3, 12, f"{metrics} quantified results (numbers, %, scale)", "Few measurable results", "Quantify impact, e.g. 'cut API latency by 40%' or 'used by 2,000 students'."),
        (verbs >= 5, 8, "Strong action verbs", "Weak or passive wording", "Start bullets with action verbs like Built, Led, Reduced, Shipped."),
        (250 <= word_count <= 900, 7, "Good length", None, "Keep it to one page (about 300-700 words)." if word_count > 900 else "Add more detail; the resume is quite short."),
    ]
    score = 0
    strengths: List[str] = []
    weaknesses: List[str] = []
    improvements: List[str] = []
    for ok, points, strength, weakness, fix in checks:
        if ok:
            score += points
            strengths.append(strength)
        else:
            if weakness:
                weaknesses.append(weakness)
            improvements.append(fix)

    missing_keywords: List[str] = []
    if job_description:
        jd = job_description.lower()
        missing_keywords = [k for k in TECH_KEYWORDS if k in jd and k not in tech_found]
        if missing_keywords:
            improvements.append("Job description keywords not in your resume: " + ", ".join(missing_keywords[:8]))

    role_fit = (
        "Strong technical candidate" if len(tech_found) >= 8
        else "Good technical foundation" if len(tech_found) >= 4
        else "Add more specific technologies you have used"
    )
    return {
        "score": min(score, 100),
        "summary": f"{len(strengths)} of {len(checks)} checks passed.",
        "strengths": strengths or ["Readable text extracted"],
        "weaknesses": weaknesses or ["No major structural issues found"],
        "improvements": improvements or ["Tailor the resume to each job you apply for"],
        "role_fit": role_fit,
        "missing_keywords": missing_keywords,
        "word_count": word_count,
        "has_github": has_github,
        "has_linkedin": has_linkedin,
        "source": "rules",
    }


LLM_PROMPT = """You are an experienced technical recruiter reviewing a software engineering resume.
Return ONLY a JSON object with these keys:
- "score": integer 0-100, how interview-ready this resume is{jd_clause}
- "summary": 1-2 sentence overall verdict
- "strengths": list of 3-5 specific strengths
- "weaknesses": list of 3-5 specific weaknesses
- "improvements": list of 4-6 concrete actions; where useful, rewrite a weak bullet from the resume as "Before: ... -> After: ..."
- "role_fit": short phrase describing which roles this resume fits best
- "missing_keywords": list of important skills/keywords missing{jd_kw_clause}
Be specific to this resume; do not give generic advice."""


def analyze_resume_llm(text: str, job_description: str = "") -> Optional[Dict]:
    if not OPENAI_API_KEY:
        return None
    jd = job_description.strip()
    system = LLM_PROMPT.format(
        jd_clause=" for the job description provided" if jd else "",
        jd_kw_clause=" compared to the job description" if jd else " for typical software roles",
    )
    user = f"RESUME:\n{text[:MAX_LLM_CHARS]}"
    if jd:
        user += f"\n\nJOB DESCRIPTION:\n{jd[:5000]}"
    try:
        res = requests.post(
            f"{OPENAI_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            json={
                "model": OPENAI_MODEL,
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            },
            timeout=60,
        )
        res.raise_for_status()
        result = json.loads(res.json()["choices"][0]["message"]["content"])
    except Exception:
        log.exception("LLM resume review failed; falling back to rule-based analysis")
        return None

    def as_list(key):
        value = result.get(key) or []
        return [str(x) for x in value][:8] if isinstance(value, list) else [str(value)]

    try:
        score = int(clamp_score(result.get("score", 0)))
    except (TypeError, ValueError):
        score = 0
    return {
        "score": score,
        "summary": str(result.get("summary", "")),
        "strengths": as_list("strengths"),
        "weaknesses": as_list("weaknesses"),
        "improvements": as_list("improvements"),
        "role_fit": str(result.get("role_fit", "")),
        "missing_keywords": as_list("missing_keywords"),
    }


def clamp_score(value) -> float:
    return max(0, min(100, float(value)))


def analyze_resume_text(text: str, job_description: str = "") -> Dict:
    rules = analyze_resume_rules(text, job_description)
    llm = analyze_resume_llm(text, job_description)
    if not llm:
        return rules
    return {
        **rules,
        **llm,
        "source": "ai",
        "checks_score": rules["score"],
    }
