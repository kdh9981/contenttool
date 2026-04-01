"""Supabase database operations for pipeline data."""

from __future__ import annotations

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
    client.table("jobs").update({"status": status}).eq("job_id", job_id).execute()
    logger.info("Job %s status → %s", job_id, status)


async def insert_video_records(
    client: Client, records: list[VideoRecord]
) -> int:
    if not records:
        return 0

    rows: list[dict[str, Any]] = []
    for r in records:
        row = r.model_dump(mode="json")
        # published_at → ISO string for Supabase
        if row.get("published_at"):
            row["published_at"] = r.published_at.isoformat() if r.published_at else None
        rows.append(row)

    result = client.table("video_records").insert(rows).execute()
    count = len(result.data) if result.data else 0
    logger.info("Inserted %d video records", count)
    return count


async def insert_trend_analysis(
    client: Client, row: dict[str, Any]
) -> str | None:
    """Insert a trend_analysis row and return the analysis_id."""
    result = client.table("trend_analysis").insert(row).execute()
    if result.data:
        analysis_id = result.data[0].get("analysis_id")
        logger.info("Inserted trend_analysis %s for job %s / %s",
                     analysis_id, row.get("job_id"), row.get("platform"))
        return analysis_id
    return None


async def fetch_queued_jobs(client: Client) -> list[dict[str, Any]]:
    result = (
        client.table("jobs")
        .select("*")
        .eq("status", "queued")
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []
