"""Supabase database operations for pipeline data."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from supabase import create_client, Client

from .config import SupabaseConfig
from .models import VideoRecord

logger = logging.getLogger(__name__)


def get_client(config: SupabaseConfig) -> Client:
    return create_client(config.url, config.service_role_key)


async def update_job_status(
    client: Client, job_id: str, status: str
) -> None:
    await asyncio.to_thread(
        lambda: client.table("jobs").update({"status": status}).eq("job_id", job_id).execute()
    )
    logger.info("Job %s status -> %s", job_id, status)


async def insert_video_records(
    client: Client, records: list[VideoRecord]
) -> list[dict[str, Any]]:
    """Insert video records and return the inserted rows (with record_id UUIDs)."""
    if not records:
        return []

    rows: list[dict[str, Any]] = []
    for r in records:
        row = r.model_dump(mode="json")
        # published_at -> ISO string for Supabase
        if row.get("published_at"):
            row["published_at"] = r.published_at.isoformat() if r.published_at else None
        rows.append(row)

    result = await asyncio.to_thread(
        lambda: client.table("video_records").insert(rows).execute()
    )
    inserted = result.data or []
    logger.info("Inserted %d video records", len(inserted))
    return inserted


async def insert_trend_analysis(
    client: Client, row: dict[str, Any]
) -> str | None:
    """Insert a trend_analysis row and return the analysis_id."""
    result = await asyncio.to_thread(
        lambda: client.table("trend_analysis").insert(row).execute()
    )
    if result.data:
        analysis_id = result.data[0].get("analysis_id")
        logger.info("Inserted trend_analysis %s for job %s / %s",
                     analysis_id, row.get("job_id"), row.get("platform"))
        return analysis_id
    return None


async def insert_content_package(
    client: Client, package: dict[str, Any]
) -> str | None:
    """Insert a content_packages row and return the package id."""
    result = await asyncio.to_thread(
        lambda: client.table("content_packages").insert(package).execute()
    )
    if result.data:
        pkg_id = result.data[0].get("id")
        logger.info("Created content package %s for job %s", pkg_id, package.get("job_id"))
        return pkg_id
    return None


async def fetch_queued_jobs(client: Client) -> list[dict[str, Any]]:
    result = await asyncio.to_thread(
        lambda: (
            client.table("jobs")
            .select("*")
            .eq("status", "queued")
            .order("created_at", desc=False)
            .execute()
        )
    )
    return result.data or []
