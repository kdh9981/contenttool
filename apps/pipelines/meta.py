"""Meta (Instagram + Facebook) extraction pipeline.

- Competitor ads: Meta Ad Library API (free, requires verified FB account)
- Organic IG data: Apify Instagram Scraper
"""

from __future__ import annotations

import logging
from datetime import datetime

import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

from .config import PipelineConfig
from .models import Job, VideoRecord, PipelineResult

logger = logging.getLogger(__name__)

AD_LIBRARY_URL = "https://graph.facebook.com/v19.0/ads_archive"


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
async def _search_ad_library(
    session: aiohttp.ClientSession,
    access_token: str,
    query: str,
    country: str,
    limit: int,
) -> list[dict]:
    """Search Meta Ad Library for competitor ads."""
    params = {
        "access_token": access_token,
        "search_terms": query,
        "ad_reached_countries": country,
        "ad_type": "ALL",
        "fields": "id,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,"
        "page_id,page_name,publisher_platforms,impressions,"
        "spend,currency,ad_delivery_start_time,ad_delivery_stop_time",
        "limit": min(limit, 50),
    }
    async with session.get(AD_LIBRARY_URL, params=params) as resp:
        resp.raise_for_status()
        data = await resp.json()
        return data.get("data", [])


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception(_is_retryable),
    reraise=True,
)
async def _apify_instagram_search(
    session: aiohttp.ClientSession,
    token: str,
    actor_id: str,
    hashtags: list[str],
    max_results: int,
) -> list[dict]:
    """Run Apify Instagram Scraper for organic posts/reels."""
    run_url = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items"
    params = {"token": token}
    payload = {
        "search": " ".join(hashtags),
        "resultsType": "posts",
        "resultsLimit": max_results,
        "searchType": "hashtag",
    }
    async with session.post(
        run_url, json=payload, params=params, timeout=aiohttp.ClientTimeout(total=120)
    ) as resp:
        resp.raise_for_status()
        return await resp.json()


def _parse_ad_record(job_id: str, ad: dict) -> VideoRecord:
    """Map an Ad Library result to a VideoRecord (ads are tracked as content)."""
    published = None
    if ad.get("ad_delivery_start_time"):
        try:
            published = datetime.fromisoformat(
                ad["ad_delivery_start_time"].replace("Z", "+00:00")
            )
        except (ValueError, TypeError):
            pass

    bodies = ad.get("ad_creative_bodies", [])
    caption = bodies[0] if bodies else ""

    # Impressions come as a range dict: {"lower_bound": "1000", "upper_bound": "2000"}
    impressions = ad.get("impressions", {})
    view_count = 0
    if isinstance(impressions, dict):
        view_count = int(impressions.get("upper_bound", impressions.get("lower_bound", 0)))

    platforms = ad.get("publisher_platforms", [])
    platform = "instagram" if "instagram" in platforms else "facebook"

    return VideoRecord(
        job_id=job_id,
        platform=platform,
        video_id=str(ad.get("id", "")),
        video_url=ad.get("ad_snapshot_url", ""),
        published_at=published,
        creator_username=ad.get("page_name"),
        view_count=view_count,
        caption=caption,
        media_type="ad",
        raw_data=ad,
    )


def _parse_instagram_record(job_id: str, post: dict) -> VideoRecord:
    """Map an Apify Instagram post to a VideoRecord."""
    published = None
    if post.get("timestamp"):
        try:
            published = datetime.fromisoformat(
                post["timestamp"].replace("Z", "+00:00")
            )
        except (ValueError, TypeError):
            pass

    # Determine media type
    ptype = post.get("type", "").lower()
    if ptype in ("video", "reel"):
        media_type = "reel" if "reel" in ptype else "video"
    elif ptype == "carousel":
        media_type = "carousel"
    else:
        media_type = "image"

    return VideoRecord(
        job_id=job_id,
        platform="instagram",
        video_id=str(post.get("id", post.get("shortCode", ""))),
        video_url=post.get("url", ""),
        published_at=published,
        creator_username=post.get("ownerUsername"),
        creator_follower_count=post.get("ownerFollowerCount"),
        creator_verified=post.get("ownerIsVerified", False),
        like_count=int(post.get("likesCount", 0)),
        comment_count=int(post.get("commentsCount", 0)),
        view_count=int(post.get("videoViewCount", post.get("playCount", 0))),
        caption=post.get("caption", ""),
        hashtags=post.get("hashtags", []),
        duration_seconds=post.get("videoDuration"),
        media_type=media_type,
        thumbnail_url=post.get("displayUrl"),
        raw_data=post,
    )


async def extract(job: Job, config: PipelineConfig) -> PipelineResult:
    """Run Meta extraction — Ad Library for ads, Apify for organic IG content."""
    all_records: list[VideoRecord] = []
    errors: list[str] = []
    query = f"{job.product_category} {job.product_name}"
    country = job.target_country[:2].upper() if job.target_country else "US"

    try:
        async with aiohttp.ClientSession() as session:
            # 1. Meta Ad Library (if access token available)
            if config.meta.access_token:
                try:
                    ads = await _search_ad_library(
                        session,
                        config.meta.access_token,
                        query,
                        country,
                        config.max_results_per_platform,
                    )
                    ad_records = [_parse_ad_record(job.job_id, ad) for ad in ads]
                    all_records.extend(ad_records)
                    logger.info("Ad Library returned %d ads", len(ad_records))
                except Exception as e:
                    logger.warning("Ad Library search failed: %s", e)
                    errors.append(f"Ad Library: {e}")
            else:
                errors.append("META_ACCESS_TOKEN not configured — skipping Ad Library")

            # 2. Apify Instagram Scraper (organic posts/reels)
            if config.meta.apify_token:
                try:
                    hashtags = [
                        job.product_category.replace(" ", ""),
                        job.product_name.replace(" ", ""),
                    ]
                    posts = await _apify_instagram_search(
                        session,
                        config.meta.apify_token,
                        config.meta.apify_actor_id,
                        hashtags,
                        config.max_results_per_platform,
                    )
                    ig_records = [
                        _parse_instagram_record(job.job_id, p) for p in posts
                    ]
                    all_records.extend(ig_records)
                    logger.info("Apify IG returned %d posts", len(ig_records))
                except Exception as e:
                    logger.warning("Apify Instagram failed: %s", e)
                    errors.append(f"Apify IG: {e}")
            else:
                errors.append("APIFY_TOKEN not configured — skipping organic IG")

            if not all_records and errors:
                return PipelineResult(
                    platform="instagram",
                    success=False,
                    error="; ".join(errors),
                )

            return PipelineResult(
                platform="instagram",
                success=True,
                records=all_records,
                records_count=len(all_records),
                error="; ".join(errors) if errors else None,
            )
    except Exception as e:
        logger.exception("Meta extraction failed for job %s", job.job_id)
        return PipelineResult(platform="instagram", success=False, error=str(e))
