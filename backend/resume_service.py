from typing import Dict, List

from pypdf import PdfReader


MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024


def extract_text_from_pdf(file_obj) -> str:
    reader = PdfReader(file_obj)
    return "".join(page.extract_text() or "" for page in reader.pages)


def analyze_resume_text(text: str) -> Dict:
    word_count = len(text.split())
    lower_text = text.lower()

    has_email = "@" in text
    digit_count = sum(1 for c in text if c.isdigit())
    has_phone = digit_count > 7
    has_github = "github.com" in lower_text or "github" in lower_text
    has_linkedin = "linkedin.com" in lower_text or "linkedin" in lower_text
    has_projects = "project" in lower_text or "experience" in lower_text
    has_education = any(k in lower_text for k in ["education", "university", "degree"])
    has_skills = any(k in lower_text for k in ["skill", "technology", "proficient"])

    score = 0
    strengths: List[str] = []
    weaknesses: List[str] = []
    improvements: List[str] = []

    if has_email:
        score += 10
        strengths.append("Contact information present")
    else:
        weaknesses.append("Missing email address")
        improvements.append("Add your email address")

    if has_phone:
        score += 5
    else:
        improvements.append("Consider adding phone number")

    if has_github:
        score += 15
        strengths.append("GitHub profile linked")
    else:
        weaknesses.append("No GitHub link")
        improvements.append("Add your GitHub profile URL")

    if has_linkedin:
        score += 10
        strengths.append("LinkedIn profile linked")
    else:
        improvements.append("Add your LinkedIn profile URL")

    if has_projects:
        score += 20
        strengths.append("Projects/experience section present")
    else:
        weaknesses.append("Missing projects or experience")
        improvements.append("Add a projects or experience section")

    if has_education:
        score += 15
        strengths.append("Education section present")
    else:
        weaknesses.append("Missing education information")
        improvements.append("Add education details")

    if has_skills:
        score += 15
        strengths.append("Skills section present")
    else:
        weaknesses.append("Missing skills section")
        improvements.append("Add a skills section")

    if word_count > 300:
        score += 10
        strengths.append("Adequate detail and length")
    elif word_count < 150:
        weaknesses.append("Resume too short")
        improvements.append("Add more detail to your resume")

    tech_keywords = ["python", "javascript", "java", "react", "node", "sql", "api", "database"]
    tech_count = sum(1 for keyword in tech_keywords if keyword in lower_text)
    role_fit = (
        "Strong technical candidate"
        if tech_count >= 5
        else "Good technical foundation"
        if tech_count >= 3
        else "Consider adding more technical keywords"
    )

    return {
        "score": min(score, 100),
        "strengths": strengths or ["Resume structure is good"],
        "weaknesses": weaknesses or ["Minor improvements possible"],
        "improvements": improvements or ["Continue refining your resume"],
        "role_fit": role_fit,
        "word_count": word_count,
        "has_github": has_github,
        "has_linkedin": has_linkedin,
    }
