"""YouTube Data API v3 extraction pipeline.

Quota budget: search = 100 units, video details = 1 unit.
Free tier = 10,000 units/day.  Strategy: search once, batch-fetch details.
"""

from __future__ import annotations

import logging
from datetime import datetime

import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

from .config import PipelineConfig
from .models import Job, VideoRecord, PipelineResult

logger = logging.getLogger(__name__)

BASE_URL = "https://www.googleapis.com/youtube/v3"


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, aiohttp.ClientResponseError):
        return exc.status in (429, 500, 502, 503)
    return isinstance(exc, (aiohttp.ClientError, TimeoutError))


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception(_is_retryable),
    reraise=True,
)
async def _api_get(
    session: aiohttp.ClientSession, endpoint: str, params: dict
) -> dict:
    url = f"{BASE_URL}/{endpoint}"
    async with session.get(url, params=params) as resp:
        resp.raise_for_status()
        return await resp.json()


async def _search_videos(
    session: aiohttp.ClientSession,
    api_key: str,
    query: str,
    published_after: str,
    published_before: str,
    max_results: int,
    region_code: str,
) -> list[str]:
    """Search for video IDs. Costs 100 quota units per call."""
    params = {
        "part": "id",
        "type": "video",
        "q": query,
        "publishedAfter": published_after,
        "publishedBefore": published_before,
        "maxResults": min(max_results, 50),
        "order": "viewCount",
        "regionCode": region_code,
        "key": api_key,
    }
    data = await _api_get(session, "search", params)
    return [item["id"]["videoId"] for item in data.get("items", [])]


async def _get_video_details(
    session: aiohttp.ClientSession,
    api_key: str,
    video_ids: list[str],
) -> list[dict]:
    """Batch-fetch video details. Costs 1 unit per video."""
    if not video_ids:
        return []
    params = {
        "part": "snippet,statistics,contentDetails",
        "id": ",".join(video_ids),
        "key": api_key,
    }
    data = await _api_get(session, "videos", params)
    return data.get("items", [])


def _parse_duration_to_seconds(iso_duration: str) -> int | None:
    """Parse ISO 8601 duration (PT1H2M3S) to seconds."""
    if not iso_duration or not iso_duration.startswith("PT"):
        return None
    s = iso_duration[2:]
    hours = minutes = seconds = 0
    for unit, char in [("H", "hours"), ("M", "minutes"), ("S", "seconds")]:
        if unit in s:
            val, s = s.split(unit, 1)
            if char == "hours":
                hours = int(val)
            elif char == "minutes":
                minutes = int(val)
            else:
                seconds = int(val)
    return hours * 3600 + minutes * 60 + seconds


def _is_short(duration_seconds: int | None) -> bool:
    return duration_seconds is not None and duration_seconds <= 60


def _to_video_record(job_id: str, item: dict) -> VideoRecord:
    snippet = item.get("snippet", {})
    stats = item.get("statistics", {})
    content = item.get("contentDetails", {})

    duration_sec = _parse_duration_to_seconds(content.get("duration", ""))
    media_type = "short" if _is_short(duration_sec) else "video"

    published = None
    if snippet.get("publishedAt"):
        published = datetime.fromisoformat(
            snippet["publishedAt"].replace("Z", "+00:00")
        )

    return VideoRecord(
        job_id=job_id,
        platform="youtube",
        video_id=item["id"],
        video_url=f"https://www.youtube.com/watch?v={item['id']}",
        published_at=published,
        creator_username=snippet.get("channelTitle"),
        like_count=int(stats.get("likeCount", 0)),
        comment_count=int(stats.get("commentCount", 0)),
        view_count=int(stats.get("viewCount", 0)),
        caption=snippet.get("description", ""),
        hashtags=snippet.get("tags", []),
        duration_seconds=duration_sec,
        media_type=media_type,
        thumbnail_url=(snippet.get("thumbnails", {}).get("high", {}).get("url")),
        raw_data=item,
    )


async def extract(job: Job, config: PipelineConfig) -> PipelineResult:
    """Run YouTube extraction for a job."""
    api_key = config.youtube.api_key
    if not api_key:
        return PipelineResult(
            platform="youtube",
            success=False,
            error="YOUTUBE_API_KEY not configured",
        )

    # Build search query from job context
    query = f"{job.product_category} {job.product_name}"
    region = job.target_country[:2].upper() if job.target_country else "US"
    published_after = f"{job.analysis_period_start}T00:00:00Z"
    published_before = f"{job.analysis_period_end}T23:59:59Z"

    try:
        async with aiohttp.ClientSession() as session:
            video_ids = await _search_videos(
                session,
                api_key,
                query,
                published_after,
                published_before,
                config.max_results_per_platform,
                region,
            )
            if not video_ids:
                return PipelineResult(
                    platform="youtube", success=True, records_count=0
                )

            details = await _get_video_details(session, api_key, video_ids)
            records = [_to_video_record(job.job_id, item) for item in details]

            return PipelineResult(
                platform="youtube",
                success=True,
                records=records,
                records_count=len(records),
            )
    except Exception as e:
        logger.exception("YouTube extraction failed for job %s", job.job_id)
        return PipelineResult(
            platform="youtube", success=False, error=str(e)
        )
