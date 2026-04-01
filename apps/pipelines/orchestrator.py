"""Pipeline orchestrator — runs platform extractors in parallel per job."""

from __future__ import annotations

import asyncio
import logging
from typing import Callable, Awaitable, Union

import re
from collections import Counter

from .config import PipelineConfig
from .db import get_client, update_job_status, insert_video_records, insert_trend_analysis, insert_content_package
from .models import Job, PipelineResult, VideoRecord
from .brief_generator import generate_brief, _engagement_score
from .content_generator import generate_content_package
from . import youtube, tiktok, meta

logger = logging.getLogger(__name__)

# Type alias: extractors return either a single result or a list (meta returns list)
ExtractResult = Union[PipelineResult, list[PipelineResult]]

# Maps platform name → extract function
EXTRACTORS: dict[str, Callable[[Job, PipelineConfig], Awaitable[ExtractResult]]] = {
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
            # meta.extract returns a list; others return a single result
            if isinstance(result, list):
                results.extend(result)
            else:
                results.append(result)
        except Exception as e:
            logger.exception("Unhandled error in %s extractor", platform)
            results.append(
                PipelineResult(platform=platform, success=False, error=str(e))
            )

    # Persist all successful records and capture the inserted rows (with record_id UUIDs)
    all_records = []
    for r in results:
        if r.success and r.records:
            all_records.extend(r.records)

    inserted_rows: list[dict] = []
    if all_records:
        inserted_rows = await insert_video_records(db, all_records)

    # Build video_id → record_id mapping for top_videos references
    video_id_to_record_id: dict[str, str] = {}
    for row in inserted_rows:
        vid = row.get("video_id", "")
        rid = row.get("record_id", "")
        if vid and rid:
            video_id_to_record_id[vid] = rid

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
        await _generate_briefs(db, job, results, config, video_id_to_record_id)

    return results


async def _generate_briefs(
    db,
    job: Job,
    results: list[PipelineResult],
    config: PipelineConfig,
    video_id_to_record_id: dict[str, str],
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
        # Use record_id UUIDs (from DB insert) for top_videos, falling back to video_id
        top_record_ids = [
            video_id_to_record_id.get(r.video_id, r.video_id)
            for r, _ in scored[:20]
        ]

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

        # Content theme extraction from captions and hashtags
        top_content_themes = _extract_themes(records)

        # Competitor benchmarking
        competitor_benchmark = _benchmark_competitors(job, records)

        # Generate AI brief (best-effort)
        brief_text = await generate_brief(
            config.gemini, job, platform, records
        )

        # Store trend_analysis row
        row = {
            "job_id": job.job_id,
            "platform": platform,
            "period_start": job.analysis_period_start,
            "period_end": job.analysis_period_end,
            "top_videos": top_record_ids,
            "top_hashtags": top_hashtags,
            "top_content_themes": top_content_themes,
            "avg_like_count": avg_likes,
            "avg_view_count": avg_views,
            "avg_comment_count": avg_comments,
            "content_brief": brief_text,
            "competitor_benchmark": competitor_benchmark,
        }
        analysis_id = await insert_trend_analysis(db, row)

        # Generate content assets and create a content package (best-effort)
        if brief_text:
            try:
                content_body = await generate_content_package(
                    config, job, platform, brief_text, analysis_id
                )
                package_row = {
                    "job_id": job.job_id,
                    "title": f"{job.product_name} — {platform.title()} Content Package",
                    "status": "draft",
                    "content_type": "bundle",
                    "content_body": content_body,
                    "platform": platform,
                    "target_audience": job.target_icp,
                    "created_by": "pipeline-worker",
                }
                await insert_content_package(db, package_row)
            except Exception as e:
                logger.error("Content package generation failed for %s: %s", platform, e)


# ---------------------------------------------------------------------------
# Theme extraction — clusters captions and hashtags into content themes
# ---------------------------------------------------------------------------

# Common words to ignore when extracting themes
_STOP_WORDS = frozenset(
    "the a an and or but in on at to for of is it this that with from by as be "
    "are was were has have had do does did will would can could may might shall "
    "should not no so if then than too very just about up out all more also how "
    "its my your our their he she they we you i me us him her them what which "
    "who when where why am been being each few some such only own same into over "
    "after before between through during above below again further once here there".split()
)


def _extract_themes(records: list[VideoRecord], max_themes: int = 10) -> list[str]:
    """Extract content themes from video captions and hashtags.

    Groups related terms by frequency to identify the dominant content themes
    across a set of videos. Returns the top themes as short descriptive labels.
    """
    word_counter: Counter[str] = Counter()

    for r in records:
        # Extract meaningful words from captions
        if r.caption:
            words = re.findall(r"[a-zA-Z]{3,}", r.caption.lower())
            for w in words:
                if w not in _STOP_WORDS and len(w) <= 30:
                    word_counter[w] += 1

        # Hashtags are already theme signals
        for tag in r.hashtags:
            cleaned = tag.lower().strip("#")
            if cleaned and len(cleaned) >= 3:
                word_counter[cleaned] += 1

    # Filter out words that appear only once (noise)
    themes = [
        word for word, count in word_counter.most_common(max_themes * 2)
        if count >= 2
    ][:max_themes]

    return themes


# ---------------------------------------------------------------------------
# Competitor benchmarking — compares competitor vs category engagement
# ---------------------------------------------------------------------------

def _benchmark_competitors(job: Job, records: list[VideoRecord]) -> dict | None:
    """Partition records into competitor vs. category and compare engagement.

    Returns a benchmark dict with average scores for each group, or None
    if no competitor accounts are configured.
    """
    if not job.competitor_accounts:
        return None

    competitor_handles = {
        handle.lower().strip("@") for handle in job.competitor_accounts
    }

    competitor_records: list[VideoRecord] = []
    category_records: list[VideoRecord] = []

    for r in records:
        username = (r.creator_username or "").lower().strip("@")
        if username in competitor_handles:
            competitor_records.append(r)
        else:
            category_records.append(r)

    def _avg_metrics(recs: list[VideoRecord]) -> dict:
        if not recs:
            return {
                "count": 0,
                "avg_engagement_score": 0,
                "avg_views": 0,
                "avg_likes": 0,
                "avg_comments": 0,
                "avg_shares": 0,
            }
        n = len(recs)
        return {
            "count": n,
            "avg_engagement_score": round(
                sum(_engagement_score(r) for r in recs) / n, 1
            ),
            "avg_views": round(sum(r.view_count for r in recs) / n, 1),
            "avg_likes": round(sum(r.like_count for r in recs) / n, 1),
            "avg_comments": round(sum(r.comment_count for r in recs) / n, 1),
            "avg_shares": round(sum(r.share_count for r in recs) / n, 1),
        }

    comp_metrics = _avg_metrics(competitor_records)
    cat_metrics = _avg_metrics(category_records)

    # Compute relative performance (competitor vs category average)
    relative_score = None
    if cat_metrics["avg_engagement_score"] > 0:
        relative_score = round(
            comp_metrics["avg_engagement_score"] / cat_metrics["avg_engagement_score"],
            2,
        )

    return {
        "competitor_accounts": list(competitor_handles),
        "competitor": comp_metrics,
        "category": cat_metrics,
        "relative_performance": relative_score,
    }
