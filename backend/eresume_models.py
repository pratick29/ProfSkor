"""
Data model for the e-resume. Everything a user types is length-limited and every link must be
a plain http(s) URL, because this content is rendered on a public page.
"""
import re
import uuid
from typing import Annotated, List, Optional

from pydantic import AfterValidator, BaseModel, Field, StringConstraints, field_validator

from schemas import GITHUB_USERNAME_RE, LEETCODE_USERNAME_RE, clean_username

HOST_RE = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{1,5})?$", re.IGNORECASE)
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$")
REPO_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$")
RESERVED_SLUGS = {
    "admin", "api", "app", "about", "help", "login", "logout", "signup", "settings", "support",
    "profskor", "resume", "resumes", "www", "me", "new", "edit", "null", "undefined", "root", "r",
}


def clean_url(value: str) -> str:
    """'' or an absolute http(s) URL. Bare domains like 'github.com/me' get https:// added."""
    value = (value or "").strip()
    if not value:
        return ""
    if not re.match(r"^https?://", value, re.IGNORECASE):
        if "://" in value or value.lower().startswith(("javascript:", "data:", "mailto:")):
            raise ValueError("Links must start with http:// or https://")
        value = "https://" + value
    host = re.match(r"^https?://([^/?#]+)", value, re.IGNORECASE)
    if not host or not HOST_RE.match(host.group(1)) or any(c.isspace() for c in value):
        raise ValueError(f"'{value}' is not a valid link")
    return value[:300]


def short(n: int):
    return Annotated[str, StringConstraints(strip_whitespace=True, max_length=n)]


Url = Annotated[str, AfterValidator(clean_url)]
Line = short(400)
ItemId = short(40)


def new_id() -> str:
    return uuid.uuid4().hex[:8]


class Basics(BaseModel):
    name: short(80) = ""
    headline: short(140) = ""
    email: short(120) = ""
    phone: short(40) = ""
    location: short(80) = ""
    summary: short(1500) = ""
    website: Url = ""
    linkedin: Url = ""
    github: short(200) = ""
    leetcode: short(200) = ""

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        if value and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value):
            raise ValueError("Enter a valid email address")
        return value

    @field_validator("github")
    @classmethod
    def check_github(cls, value: str) -> str:
        return clean_username(value, GITHUB_USERNAME_RE, "GitHub", "github.com")

    @field_validator("leetcode")
    @classmethod
    def check_leetcode(cls, value: str) -> str:
        return clean_username(value, LEETCODE_USERNAME_RE, "LeetCode", "leetcode.com")


class Experience(BaseModel):
    id: ItemId = Field(default_factory=new_id)
    role: short(120) = ""
    company: short(120) = ""
    location: short(80) = ""
    start: short(30) = ""
    end: short(30) = ""
    link: Url = ""
    bullets: List[Line] = Field(default_factory=list, max_length=12)


class Project(BaseModel):
    id: ItemId = Field(default_factory=new_id)
    name: short(120) = ""
    description: Line = ""
    tech: List[short(40)] = Field(default_factory=list, max_length=15)
    repo_url: Url = ""
    demo_url: Url = ""
    # "owner/name" when the project is a GitHub repo; used to show live, verified repo stats
    repo: short(140) = ""
    bullets: List[Line] = Field(default_factory=list, max_length=10)

    @field_validator("repo")
    @classmethod
    def check_repo(cls, value: str) -> str:
        if value and not REPO_RE.match(value):
            return ""
        return value


class Education(BaseModel):
    id: ItemId = Field(default_factory=new_id)
    school: short(140) = ""
    degree: short(140) = ""
    start: short(30) = ""
    end: short(30) = ""
    details: Line = ""


class ResumeData(BaseModel):
    basics: Basics = Field(default_factory=Basics)
    skills: List[short(40)] = Field(default_factory=list, max_length=60)
    experience: List[Experience] = Field(default_factory=list, max_length=20)
    projects: List[Project] = Field(default_factory=list, max_length=20)
    education: List[Education] = Field(default_factory=list, max_length=10)
    achievements: List[Line] = Field(default_factory=list, max_length=20)

    @field_validator("skills")
    @classmethod
    def dedupe_skills(cls, value: List[str]) -> List[str]:
        seen, out = set(), []
        for skill in value:
            if skill and skill.lower() not in seen:
                seen.add(skill.lower())
                out.append(skill)
        return out


class ResumeSettings(BaseModel):
    show_email: bool = True
    show_phone: bool = False


class SaveResumeRequest(BaseModel):
    data: ResumeData
    settings: ResumeSettings = Field(default_factory=ResumeSettings)


class PublishRequest(BaseModel):
    slug: str = Field(min_length=1, max_length=60)
    published: bool

    @field_validator("slug")
    @classmethod
    def check_slug(cls, value: str) -> str:
        value = value.strip().lower()
        problem = slug_problem(value)
        if problem:
            raise ValueError(problem)
        return value


class ViewStart(BaseModel):
    via: Optional[str] = Field(default=None, max_length=100)
    referrer: Optional[str] = Field(default=None, max_length=500)


class ViewClick(BaseModel):
    target: short(300)
    kind: short(30) = "link"


class ViewUpdate(BaseModel):
    duration_ms: int = Field(default=0, ge=0, le=6 * 60 * 60 * 1000)
    sections: List[short(30)] = Field(default_factory=list, max_length=20)
    clicks: List[ViewClick] = Field(default_factory=list, max_length=50)


def slug_problem(slug: str) -> Optional[str]:
    if not SLUG_RE.match(slug):
        return "Use 3-30 lowercase letters, numbers or hyphens (not at the start or end)"
    if slug in RESERVED_SLUGS:
        return "That handle is reserved"
    return None
