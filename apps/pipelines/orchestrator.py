"""Pipeline orchestrator — runs platform extractors in parallel per job."""

from __future__ import annotations

import asyncio
import logging
from typing import Callable, Awaitable

from collections import Counter

from .config import PipelineConfig
from .db import get_client, update_job_status, insert_video_records, insert_trend_analysis
from .models import Job, PipelineResult
from .brief_generator import generate_brief, _engagement_score
from . import youtube, tiktok, meta

logger = logging.getLogger(__name__)

# Maps platform name → extract function
EXTRACTORS: dict[str, Callable[[Job, PipelineConfig], Awaitable[PipelineResult]]] = {
    "youtube": youtube.extract,
    "tiktok": tiktok.extract,
    "instagram": meta.extract,
    "facebook": meta.extract,  # same module handles both
}


async def run_job(job: Job, config: PipelineConfig) -> list[PipelineResult]:
    """Execute all platform pipelines for a single job in parallel."""
    db = get_client(config.supabase)

    await update_job_status(db, job.job_id, "running")

    # Deduplicate: if both instagram and facebook requested, meta.extract handles both
    seen_extractors: set[str] = set()
    tasks: list[tuple[str, asyncio.Task]] = []

    for platform in job.platforms:
        extractor = EXTRACTORS.get(platform)
        if not extractor:
            logger.warning("No extractor for platform: %s", platform)
            continue
        # Avoid running meta.extract twice
        extractor_key = f"{extractor.__module__}.{extractor.__qualname__}"
        if extractor_key in seen_extractors:
            continue
        seen_extractors.add(extractor_key)

        task = asyncio.create_task(extractor(job, config))
        tasks.append((platform, task))

    results: list[PipelineResult] = []
    for platform, task in tasks:
        try:
            result = await task
            results.append(result)
        except Exception as e:
            logger.exception("Unhandled error in %s extractor", platform)
            results.append(
                PipelineResult(platform=platform, success=False, error=str(e))
            )

    # Persist all successful records
    all_records = []
    for r in results:
        if r.success and r.records:
            all_records.extend(r.records)

    if all_records:
        await insert_video_records(db, all_records)

    # Determine final job status
    all_failed = all(not r.success for r in results)

    if all_failed:
        await update_job_status(db, job.job_id, "failed")
    else:
        await update_job_status(db, job.job_id, "completed")

    # Log summary
    for r in results:
        status_str = "OK" if r.success else "FAIL"
        logger.info(
            "  %s: %s — %d records%s",
            r.platform,
            status_str,
            r.records_count,
            f" (error: {r.error})" if r.error else "",
        )

    # --- Phase: Generate content briefs per platform ---
    if not all_failed:
        await _generate_briefs(db, job, results, config)

    return results


async def _generate_briefs(
    db, job: Job, results: list[PipelineResult], config: PipelineConfig
) -> None:
    """Score videos, generate AI briefs, and store trend_analysis rows."""
    for result in results:
        if not result.success or not result.records:
            continue

        platform = result.platform
        records = result.records

        # Compute engagement scores and rank
        scored = sorted(
            [(r, _engagement_score(r)) for r in records],
            key=lambda x: x[1],
            reverse=True,
        )
        top_record_ids = [r.video_id for r, _ in scored[:20]]

        # Aggregate stats
        avg_likes = sum(r.like_count for r in records) / len(records)
        avg_views = sum(r.view_count for r in records) / len(records)
        avg_comments = sum(r.comment_count for r in records) / len(records)

        # Top hashtags
        hashtag_counter: Counter = Counter()
        for r in records:
            for tag in r.hashtags:
                hashtag_counter[tag.lower().strip("#")] += 1
        top_hashtags = [tag for tag, _ in hashtag_counter.most_common(20)]

        # Generate AI brief (best-effort)
        brief_text = await generate_brief(
            config.anthropic, job, platform, records
        )

        # Store trend_analysis row
        row = {
            "job_id": job.job_id,
            "platform": platform,
            "period_start": job.analysis_period_start,
            "period_end": job.analysis_period_end,
            "top_videos": top_record_ids,
            "top_hashtags": top_hashtags,
            "top_content_themes": [],  # populated by future theme extraction
            "avg_like_count": avg_likes,
            "avg_view_count": avg_views,
            "avg_comment_count": avg_comments,
            "content_brief": brief_text,
        }
        await insert_trend_analysis(db, row)
