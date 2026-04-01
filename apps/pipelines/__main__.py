"""CLI entry point: python -m pipelines [--job-id UUID | --process-queue]"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from .config import PipelineConfig
from .db import get_client, fetch_queued_jobs
from .models import Job
from .orchestrator import run_job

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


async def process_single_job(job_id: str, config: PipelineConfig) -> None:
    db = get_client(config.supabase)
    result = db.table("jobs").select("*").eq("job_id", job_id).single().execute()
    if not result.data:
        logger.error("Job %s not found", job_id)
        sys.exit(1)

    job = Job(**result.data)
    results = await run_job(job, config)

    success_count = sum(1 for r in results if r.success)
    total_records = sum(r.records_count for r in results)
    logger.info(
        "Job %s complete: %d/%d platforms succeeded, %d records",
        job_id,
        success_count,
        len(results),
        total_records,
    )


async def process_queue(config: PipelineConfig) -> None:
    db = get_client(config.supabase)
    queued = await fetch_queued_jobs(db)
    if not queued:
        logger.info("No queued jobs found")
        return

    logger.info("Found %d queued jobs", len(queued))
    for row in queued:
        job = Job(**row)
        logger.info("Processing job %s: %s / %s", job.job_id, job.company_name, job.product_name)
        await run_job(job, config)


def main() -> None:
    parser = argparse.ArgumentParser(description="Content intelligence data pipelines")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--job-id", help="Process a specific job by UUID")
    group.add_argument(
        "--process-queue",
        action="store_true",
        help="Process all queued jobs",
    )
    args = parser.parse_args()

    config = PipelineConfig()

    if args.job_id:
        asyncio.run(process_single_job(args.job_id, config))
    else:
        asyncio.run(process_queue(config))


if __name__ == "__main__":
    main()
