import re
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

GITHUB_USERNAME_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
LEETCODE_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,40}$")


def clean_username(value: str, pattern: re.Pattern, platform: str, host: str) -> str:
    """Accept a bare username, '@name', or a pasted profile URL like https://github.com/name/."""
    value = (value or "").strip().lstrip("@")
    url = re.match(rf"^(?:https?://)?(?:www\.)?{re.escape(host)}/(.*)$", value, re.IGNORECASE)
    if url:
        # LeetCode profile URLs look like leetcode.com/u/<name>/
        segments = [p for p in url.group(1).split("/") if p and p != "u"]
        value = segments[0] if segments else ""
    if value and not pattern.match(value):
        raise ValueError(f"'{value}' is not a valid {platform} username")
    return value


PostingFrequency = Literal["0 per week", "1 per week", "2-3 per week", "4+ per week"]
ProfileType = Literal["github", "leetcode", "linkedin", "fullscore", "resume"]


class LinkedinInput(BaseModel):
    has_headline: bool = False
    has_about: bool = False
    has_projects: bool = False
    has_photo: bool = False
    has_experience: bool = False
    posting: PostingFrequency = "0 per week"


class ScoreRequest(BaseModel):
    # Ignored: the user is taken from the auth token. Kept so older clients don't get a 422.
    user_id: Optional[str] = Field(default=None, max_length=128)
    role: str = Field(default="general", max_length=120)
    github_username: str = Field(default="", max_length=200)
    leetcode_username: str = Field(default="", max_length=200)
    linkedin: LinkedinInput = Field(default_factory=LinkedinInput)
    preferences: Optional[Dict[str, Any]] = None

    @field_validator("github_username")
    @classmethod
    def clean_github(cls, value: str) -> str:
        return clean_username(value, GITHUB_USERNAME_RE, "GitHub", "github.com")

    @field_validator("leetcode_username")
    @classmethod
    def clean_leetcode(cls, value: str) -> str:
        return clean_username(value, LEETCODE_USERNAME_RE, "LeetCode", "leetcode.com")


class GithubScoreRequest(BaseModel):
    github_username: str = Field(min_length=1, max_length=200)
    preferences: Optional[Dict[str, Any]] = None

    @field_validator("github_username")
    @classmethod
    def clean_github(cls, value: str) -> str:
        value = clean_username(value, GITHUB_USERNAME_RE, "GitHub", "github.com")
        if not value:
            raise ValueError("GitHub username is required")
        return value


class LeetcodeScoreRequest(BaseModel):
    leetcode_username: str = Field(min_length=1, max_length=200)
    preferences: Optional[Dict[str, Any]] = None

    @field_validator("leetcode_username")
    @classmethod
    def clean_leetcode(cls, value: str) -> str:
        value = clean_username(value, LEETCODE_USERNAME_RE, "LeetCode", "leetcode.com")
        if not value:
            raise ValueError("LeetCode username is required")
        return value


class LinkedinScoreRequest(BaseModel):
    has_headline: bool
    has_about: bool
    has_projects: bool
    has_photo: bool = False
    has_experience: bool = False
    posting: PostingFrequency
    preferences: Optional[Dict[str, Any]] = None


class SaveProfileRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=128)
    profile_type: ProfileType
    profile_name: Optional[str] = None
    profile_data: Dict[str, Any]


class ErrorResponse(BaseModel):
    error: str


class ResumeReviewResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    strengths: List[str]
    weaknesses: List[str]
    improvements: List[str]
    role_fit: str
    word_count: int
    has_github: bool
    has_linkedin: bool


class ScoreHistoryRow(BaseModel):
    id: Optional[int] = None
    user_id: str
    overall_score: float
    github_score: float
    leetcode_score: float
    linkedin_score: float
    created_at: datetime
