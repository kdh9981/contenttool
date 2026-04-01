export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateToken } from "@/lib/review-auth";

// GET /api/review/:token — validate token and return job + packages for review
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await validateToken(token);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { job_id, client_name } = result.data;
  const supabase = createAdminClient();

  const [jobResult, packagesResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("job_id, company_name, product_name, product_category, target_country, platforms, status")
      .eq("job_id", job_id)
      .single(),
    supabase
      .from("content_packages")
      .select("*")
      .eq("job_id", job_id)
      .in("status", ["client_review", "approved", "revision_requested", "final"])
      .order("created_at", { ascending: false }),
  ]);

  if (jobResult.error) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    client_name,
    job: jobResult.data,
    packages: packagesResult.data ?? [],
  });
}
