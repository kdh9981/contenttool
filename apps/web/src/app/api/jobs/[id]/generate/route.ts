import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/jobs/:id/generate — trigger content generation for a completed job.
 *
 * Calls the pipeline worker's /generate endpoint to create content packages
 * from existing trend analysis data. Requires the job to have completed
 * pipeline execution first.
 *
 * Body (optional):
 *   platform  — generate for a specific platform only
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  // Verify job exists and has completed
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("*")
    .eq("job_id", id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "completed") {
    return NextResponse.json(
      { error: `Job must be completed to generate content (current: ${job.status})` },
      { status: 409 }
    );
  }

  // Check for existing trend analysis data
  const body = await request.json().catch(() => ({}));
  const platformFilter = body?.platform;

  let query = supabase
    .from("trend_analysis")
    .select("*")
    .eq("job_id", id);

  if (platformFilter) {
    query = query.eq("platform", platformFilter);
  }

  const { data: analyses, error: analysisError } = await query;

  if (analysisError || !analyses?.length) {
    return NextResponse.json(
      { error: "No trend analysis data found for this job. Run the pipeline first." },
      { status: 404 }
    );
  }

  // Forward to pipeline worker for content generation
  const workerUrl = process.env.PIPELINE_WORKER_URL;
  const workerSecret = process.env.PIPELINE_WORKER_SECRET;

  if (!workerUrl) {
    return NextResponse.json(
      { error: "PIPELINE_WORKER_URL not configured" },
      { status: 503 }
    );
  }

  try {
    const workerResponse = await fetch(`${workerUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(workerSecret ? { Authorization: `Bearer ${workerSecret}` } : {}),
      },
      body: JSON.stringify({
        job_id: id,
        platform: platformFilter || null,
      }),
    });

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      return NextResponse.json(
        { error: `Pipeline worker error: ${errorText}` },
        { status: 502 }
      );
    }

    const result = await workerResponse.json();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to reach pipeline worker: ${String(error)}` },
      { status: 502 }
    );
  }
}
