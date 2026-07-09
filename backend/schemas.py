from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


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
    user_id: str = Field(min_length=1, max_length=128)
    role: str = Field(min_length=1, max_length=120)
    github_username: str = ""
    leetcode_username: str = ""
    linkedin: LinkedinInput = Field(default_factory=LinkedinInput)
    preferences: Optional[Dict[str, Any]] = None

    @field_validator("github_username", "leetcode_username")
    @classmethod
    def strip_usernames(cls, value: str) -> str:
        return value.strip()


class GithubScoreRequest(BaseModel):
    github_username: str = Field(min_length=1, max_length=120)
    preferences: Optional[Dict[str, Any]] = None

    @field_validator("github_username")
    @classmethod
    def strip_username(cls, value: str) -> str:
        return value.strip()


class LeetcodeScoreRequest(BaseModel):
    leetcode_username: str = Field(min_length=1, max_length=120)
    preferences: Optional[Dict[str, Any]] = None

    @field_validator("leetcode_username")
    @classmethod
    def strip_username(cls, value: str) -> str:
        return value.strip()


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
