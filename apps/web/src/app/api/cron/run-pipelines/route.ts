import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Verify Vercel Cron secret to prevent unauthorized triggers
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // allow in dev when no secret configured
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// GET /api/cron/run-pipelines — triggered by Vercel Cron or manual call
// Finds queued jobs, marks them as running, and dispatches them to the
// Python pipeline worker for actual extraction.
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

  const jobIds = queuedJobs.map((j) => j.job_id);

  // Mark all queued jobs as running
  const { error: updateError } = await supabase
    .from("jobs")
    .update({ status: "running" })
    .in("job_id", jobIds);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Dispatch to the Python pipeline worker
  const workerUrl = process.env.PIPELINE_WORKER_URL;
  if (!workerUrl) {
    // Revert jobs to queued — no worker configured
    await supabase
      .from("jobs")
      .update({ status: "queued" })
      .in("job_id", jobIds);

    return NextResponse.json(
      {
        error:
          "PIPELINE_WORKER_URL not configured. Jobs reverted to queued. " +
          "Deploy the pipeline worker and set PIPELINE_WORKER_URL.",
        job_ids: jobIds,
      },
      { status: 503 }
    );
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const workerSecret = process.env.PIPELINE_WORKER_SECRET;
    if (workerSecret) {
      headers["Authorization"] = `Bearer ${workerSecret}`;
    }

    const workerResponse = await fetch(`${workerUrl}/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ job_ids: jobIds }),
    });

    if (!workerResponse.ok) {
      const errorText = await workerResponse.text();
      return NextResponse.json(
        {
          error: `Pipeline worker returned ${workerResponse.status}: ${errorText}`,
          job_ids: jobIds,
        },
        { status: 502 }
      );
    }

    const workerResult = await workerResponse.json();

    return NextResponse.json({
      message: `Dispatched ${jobIds.length} job(s) to pipeline worker`,
      processed: jobIds.length,
      job_ids: jobIds,
      worker_result: workerResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: `Failed to reach pipeline worker: ${message}`,
        job_ids: jobIds,
      },
      { status: 502 }
    );
  }
}
