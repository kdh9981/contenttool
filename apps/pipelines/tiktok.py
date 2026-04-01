"""TikTok extraction pipeline.

Primary: viral.app MCP endpoint.
Fallback: Apify TikTok Scraper actor.
"""

from __future__ import annotations

import logging
from datetime import datetime

import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

from .config import PipelineConfig
from .models import Job, VideoRecord, PipelineResult

logger = logging.getLogger(__name__)


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
async def _viral_app_search(
    session: aiohttp.ClientSession,
    url: str,
    api_key: str,
    query: str,
    region: str,
    max_results: int,
) -> list[dict]:
    """Search via viral.app MCP endpoint."""
    payload = {
        "method": "search",
        "params": {
            "query": query,
            "region": region,
            "limit": max_results,
            "sort_by": "engagement",
        },
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    async with session.post(url, json=payload, headers=headers) as resp:
        resp.raise_for_status()
        data = await resp.json()
        return data.get("results", data.get("data", []))


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception(_is_retryable),
    reraise=True,
)
async def _apify_search(
    session: aiohttp.ClientSession,
    token: str,
    actor_id: str,
    query: str,
    max_results: int,
) -> list[dict]:
    """Fallback: run Apify TikTok Scraper actor."""
    run_url = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items"
    params = {"token": token}
    payload = {
        "searchQueries": [query],
        "resultsPerPage": max_results,
        "shouldDownloadVideos": False,
    }
    async with session.post(
        run_url, json=payload, params=params, timeout=aiohttp.ClientTimeout(total=120)
    ) as resp:
        resp.raise_for_status()
        return await resp.json()


def _parse_viral_app_record(job_id: str, item: dict) -> VideoRecord:
    published = None
    if item.get("createTime") or item.get("published_at"):
        ts = item.get("createTime") or item.get("published_at")
        try:
            if isinstance(ts, (int, float)):
                published = datetime.utcfromtimestamp(ts)
            else:
                published = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass

    stats = item.get("stats", item)
    return VideoRecord(
        job_id=job_id,
        platform="tiktok",
        video_id=str(item.get("id", item.get("video_id", ""))),
        video_url=item.get("url", item.get("video_url", "")),
        published_at=published,
        creator_username=item.get("author", {}).get("uniqueId")
        or item.get("creator_username"),
        creator_follower_count=item.get("author", {}).get("followerCount")
        or item.get("creator_follower_count"),
        creator_verified=item.get("author", {}).get("verified", False),
        like_count=int(stats.get("diggCount", stats.get("like_count", 0))),
        comment_count=int(stats.get("commentCount", stats.get("comment_count", 0))),
        share_count=int(stats.get("shareCount", stats.get("share_count", 0))),
        view_count=int(stats.get("playCount", stats.get("view_count", 0))),
        caption=item.get("desc", item.get("caption", "")),
        hashtags=[
            t.get("title", t) if isinstance(t, dict) else str(t)
            for t in item.get("hashtags", item.get("challenges", []))
        ],
        audio_id=item.get("music", {}).get("id") or item.get("audio_id"),
        duration_seconds=item.get("video", {}).get("duration")
        or item.get("duration_seconds"),
        media_type="video",
        transcript=item.get("transcript"),
        thumbnail_url=item.get("video", {}).get("cover")
        or item.get("thumbnail_url"),
        raw_data=item,
    )


def _parse_apify_record(job_id: str, item: dict) -> VideoRecord:
    published = None
    if item.get("createTimeISO"):
        try:
            published = datetime.fromisoformat(
                item["createTimeISO"].replace("Z", "+00:00")
            )
        except (ValueError, TypeError):
            pass

    return VideoRecord(
        job_id=job_id,
        platform="tiktok",
        video_id=str(item.get("id", "")),
        video_url=item.get("webVideoUrl", item.get("url", "")),
        published_at=published,
        creator_username=item.get("authorMeta", {}).get("name"),
        creator_follower_count=item.get("authorMeta", {}).get("fans"),
        creator_verified=item.get("authorMeta", {}).get("verified", False),
        like_count=int(item.get("diggCount", 0)),
        comment_count=int(item.get("commentCount", 0)),
        share_count=int(item.get("shareCount", 0)),
        view_count=int(item.get("playCount", 0)),
        caption=item.get("text", ""),
        hashtags=[h.get("name", "") for h in item.get("hashtags", [])],
        audio_id=item.get("musicMeta", {}).get("musicId"),
        duration_seconds=item.get("videoMeta", {}).get("duration"),
        media_type="video",
        thumbnail_url=item.get("covers", {}).get("default"),
        raw_data=item,
    )


async def extract(job: Job, config: PipelineConfig) -> PipelineResult:
    """Run TikTok extraction — try viral.app first, fall back to Apify."""
    query = f"{job.product_category} {job.product_name}"
    region = job.target_country[:2].upper() if job.target_country else "US"
    max_results = config.max_results_per_platform

    try:
        async with aiohttp.ClientSession() as session:
            # Primary: viral.app MCP
            if config.tiktok.viral_app_key:
                try:
                    items = await _viral_app_search(
                        session,
                        config.tiktok.viral_app_url,
                        config.tiktok.viral_app_key,
                        query,
                        region,
                        max_results,
                    )
                    records = [_parse_viral_app_record(job.job_id, i) for i in items]
                    return PipelineResult(
                        platform="tiktok",
                        success=True,
                        records=records,
                        records_count=len(records),
                    )
                except Exception as e:
                    logger.warning(
                        "viral.app failed, falling back to Apify: %s", e
                    )

            # Fallback: Apify
            if config.tiktok.apify_token:
                items = await _apify_search(
                    session,
                    config.tiktok.apify_token,
                    config.tiktok.apify_actor_id,
                    query,
                    max_results,
                )
                records = [_parse_apify_record(job.job_id, i) for i in items]
                return PipelineResult(
                    platform="tiktok",
                    success=True,
                    records=records,
                    records_count=len(records),
                )

            return PipelineResult(
                platform="tiktok",
                success=False,
                error="No TikTok API credentials configured (need VIRAL_APP_API_KEY or APIFY_TOKEN)",
            )
    except Exception as e:
        logger.exception("TikTok extraction failed for job %s", job.job_id)
        return PipelineResult(platform="tiktok", success=False, error=str(e))
