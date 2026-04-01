import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Verify Vercel Cron secret to prevent unauthorized triggers
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // allow in dev when no secret configured
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// GET /api/cron/run-pipelines — triggered by Vercel Cron or manual call
// Creates a weekly analysis job for the prior 7-day window, then
// marks all queued jobs as ready for pipeline processing.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Check for any queued jobs to process
  const { data: queuedJobs, error: fetchError } = await supabase
    .from("jobs")
    .select("job_id, company_name, product_name, status")
    .eq("status", "queued")
    .order("created_at", { ascending: true });

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!queuedJobs || queuedJobs.length === 0) {
    return NextResponse.json({
      message: "No queued jobs to process",
      processed: 0,
    });
  }

  // Mark all queued jobs as running — the Python pipeline process
  // will be triggered externally (e.g. by a Vercel serverless function
  // that shells out, or by a separate worker process polling for running jobs).
  //
  // In production, this cron endpoint would invoke the pipeline runner.
  // For now, it transitions jobs to 'running' so the pipeline worker can pick them up.
  const jobIds = queuedJobs.map((j) => j.job_id);

  const { error: updateError } = await supabase
    .from("jobs")
    .update({ status: "running" })
    .in("job_id", jobIds);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    message: `Triggered ${jobIds.length} job(s) for pipeline processing`,
    processed: jobIds.length,
    job_ids: jobIds,
  });
}
