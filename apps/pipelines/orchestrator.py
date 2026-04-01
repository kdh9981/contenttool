"""Pipeline orchestrator — runs platform extractors in parallel per job."""

from __future__ import annotations

import asyncio
import logging
from typing import Callable, Awaitable

from .config import PipelineConfig
from .db import get_client, update_job_status, insert_video_records
from .models import Job, PipelineResult
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
    any_success = any(r.success for r in results)
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

    return results
