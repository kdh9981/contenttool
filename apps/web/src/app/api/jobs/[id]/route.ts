export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/jobs/:id — get job detail with video records and analysis
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [jobResult, recordsResult, analysisResult, packagesResult] = await Promise.all([
    supabase.from("jobs").select("*").eq("job_id", id).single(),
    supabase
      .from("video_records")
      .select("*")
      .eq("job_id", id)
      .order("view_count", { ascending: false }),
    supabase.from("trend_analysis").select("*").eq("job_id", id),
    supabase
      .from("content_packages")
      .select("*")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (jobResult.error) {
    return NextResponse.json(
      { error: "Job not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    job: jobResult.data,
    video_records: recordsResult.data ?? [],
    trend_analysis: analysisResult.data ?? [],
    content_packages: packagesResult.data ?? [],
  });
}

// DELETE /api/jobs/:id — cancel a running or queued job
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  // Only cancel jobs that are queued or running
  const { data: job, error: fetchError } = await supabase
    .from("jobs")
    .select("status")
    .eq("job_id", id)
    .single();

  if (fetchError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "queued" && job.status !== "running") {
    return NextResponse.json(
      { error: `Cannot cancel job with status '${job.status}'` },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("jobs")
    .update({ status: "failed" })
    .eq("job_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "cancelled", job_id: id });
}
