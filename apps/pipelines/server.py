"""Lightweight HTTP server that exposes pipeline execution over HTTP.

Deploy this alongside (or separately from) the Next.js app so the
Vercel cron endpoint can trigger Python pipeline execution via POST.

Usage:
    uvicorn pipelines.server:app --host 0.0.0.0 --port 8000
    # or from monorepo root: uvicorn apps.pipelines.server:app ...
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from .config import PipelineConfig
from .db import get_client, insert_content_package
from .models import Job
from .orchestrator import run_job
from .content_generator import generate_content_package

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

config: PipelineConfig | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global config
    config = PipelineConfig()
    logger.info("Pipeline worker ready")
    yield


app = FastAPI(title="Content Pipeline Worker", lifespan=lifespan)

WORKER_SECRET = os.environ.get("PIPELINE_WORKER_SECRET", "")


class RunJobsRequest(BaseModel):
    job_ids: list[str]


class RunJobsResponse(BaseModel):
    triggered: int
    results: list[dict]


def _check_auth(authorization: str | None) -> None:
    if not WORKER_SECRET:
        return  # no secret configured — allow (dev mode)
    if authorization != f"Bearer {WORKER_SECRET}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.post("/run", response_model=RunJobsResponse)
async def run_jobs(
    body: RunJobsRequest,
    authorization: str | None = Header(default=None),
):
    """Execute pipeline for the given job IDs."""
    _check_auth(authorization)
    assert config is not None

    db = get_client(config.supabase)
    results: list[dict] = []

    for job_id in body.job_ids:
        result = db.table("jobs").select("*").eq("job_id", job_id).single().execute()
        if not result.data:
            results.append({"job_id": job_id, "status": "not_found"})
            continue

        job = Job(**result.data)
        try:
            pipeline_results = await run_job(job, config)
            success_count = sum(1 for r in pipeline_results if r.success)
            total_records = sum(r.records_count for r in pipeline_results)
            results.append({
                "job_id": job_id,
                "status": "completed",
                "platforms_succeeded": success_count,
                "platforms_total": len(pipeline_results),
                "records_extracted": total_records,
            })
        except Exception as e:
            logger.exception("Pipeline failed for job %s", job_id)
            results.append({"job_id": job_id, "status": "error", "error": str(e)})

    return RunJobsResponse(triggered=len(body.job_ids), results=results)


class GenerateRequest(BaseModel):
    job_id: str
    platform: str | None = None


@app.post("/generate")
async def generate_content(
    body: GenerateRequest,
    authorization: str | None = Header(default=None),
):
    """Generate content packages from existing trend analysis data."""
    _check_auth(authorization)
    assert config is not None

    db = get_client(config.supabase)

    # Fetch job
    job_result = db.table("jobs").select("*").eq("job_id", body.job_id).single().execute()
    if not job_result.data:
        raise HTTPException(status_code=404, detail="Job not found")

    job = Job(**job_result.data)

    # Fetch trend analyses
    query = db.table("trend_analysis").select("*").eq("job_id", body.job_id)
    if body.platform:
        query = query.eq("platform", body.platform)
    analyses_result = query.execute()

    if not analyses_result.data:
        raise HTTPException(status_code=404, detail="No trend analysis found")

    packages_created: list[dict] = []
    for analysis in analyses_result.data:
        platform = analysis["platform"]
        brief_text = analysis.get("content_brief")
        analysis_id = analysis.get("analysis_id")

        if not brief_text:
            packages_created.append({
                "platform": platform,
                "status": "skipped",
                "reason": "no content brief",
            })
            continue

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
            pkg_id = await insert_content_package(db, package_row)
            packages_created.append({
                "platform": platform,
                "status": "created",
                "package_id": pkg_id,
            })
        except Exception as e:
            logger.exception("Content generation failed for %s", platform)
            packages_created.append({
                "platform": platform,
                "status": "error",
                "error": str(e),
            })

    return {"job_id": body.job_id, "packages": packages_created}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
