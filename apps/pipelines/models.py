"""Data models matching the Supabase schema."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class Job(BaseModel):
    """Mirrors the `jobs` table. Read from DB to drive pipeline execution."""

    job_id: str
    company_name: str
    product_name: str
    product_category: str
    target_icp: str
    target_country: str
    competitor_accounts: list[str] = Field(default_factory=list)
    analysis_period_start: str
    analysis_period_end: str
    platforms: list[str] = Field(
        default_factory=lambda: ["tiktok", "instagram", "facebook", "youtube"]
    )
    status: str = "queued"


class VideoRecord(BaseModel):
    """Standardized video record written to `video_records` table."""

    job_id: str
    platform: str  # tiktok | instagram | facebook | youtube
    video_id: str
    video_url: str
    published_at: datetime | None = None
    creator_username: str | None = None
    creator_follower_count: int | None = None
    creator_verified: bool = False
    like_count: int = 0
    comment_count: int = 0
    share_count: int = 0
    view_count: int = 0
    caption: str | None = None
    hashtags: list[str] = Field(default_factory=list)
    audio_id: str | None = None
    duration_seconds: int | None = None
    media_type: str | None = None  # video, reel, short, carousel, image
    transcript: str | None = None
    thumbnail_url: str | None = None
    raw_data: dict[str, Any] | None = None


class PipelineResult(BaseModel):
    """Result of a single platform extraction."""

    platform: str
    success: bool
    records: list[VideoRecord] = Field(default_factory=list)
    error: str | None = None
    records_count: int = 0
