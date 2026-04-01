"""Pipeline configuration — all secrets from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class SupabaseConfig:
    url: str = field(default_factory=lambda: os.environ["SUPABASE_URL"])
    service_role_key: str = field(
        default_factory=lambda: os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )


@dataclass(frozen=True)
class YouTubeConfig:
    api_key: str = field(default_factory=lambda: os.environ.get("YOUTUBE_API_KEY", ""))
    daily_quota_limit: int = 10_000  # free tier
    search_cost: int = 100
    video_detail_cost: int = 1


@dataclass(frozen=True)
class TikTokConfig:
    viral_app_url: str = field(
        default_factory=lambda: os.environ.get(
            "VIRAL_APP_MCP_URL", "https://viral.app/api/mcp"
        )
    )
    viral_app_key: str = field(
        default_factory=lambda: os.environ.get("VIRAL_APP_API_KEY", "")
    )
    apify_token: str = field(
        default_factory=lambda: os.environ.get("APIFY_TOKEN", "")
    )
    apify_actor_id: str = "clockworks/tiktok-scraper"


@dataclass(frozen=True)
class MetaConfig:
    app_id: str = field(
        default_factory=lambda: os.environ.get("META_APP_ID", "")
    )
    app_secret: str = field(
        default_factory=lambda: os.environ.get("META_APP_SECRET", "")
    )
    access_token: str = field(
        default_factory=lambda: os.environ.get("META_ACCESS_TOKEN", "")
    )
    apify_token: str = field(
        default_factory=lambda: os.environ.get("APIFY_TOKEN", "")
    )
    apify_actor_id: str = "apify/instagram-scraper"


@dataclass(frozen=True)
class PipelineConfig:
    supabase: SupabaseConfig = field(default_factory=SupabaseConfig)
    youtube: YouTubeConfig = field(default_factory=YouTubeConfig)
    tiktok: TikTokConfig = field(default_factory=TikTokConfig)
    meta: MetaConfig = field(default_factory=MetaConfig)
    max_results_per_platform: int = 50
    retry_attempts: int = 3
