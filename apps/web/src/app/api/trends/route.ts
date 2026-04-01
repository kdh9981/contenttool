import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/trends — retrieve trend analysis reports with optional filtering.
 *
 * Query params:
 *   platform  — filter by platform (tiktok, instagram, facebook, youtube)
 *   job_id    — filter by specific job
 *   from      — period_start >= date (YYYY-MM-DD)
 *   to        — period_end <= date (YYYY-MM-DD)
 *   limit     — max results (default 20, max 100)
 */
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const params = request.nextUrl.searchParams;

  const platform = params.get("platform");
  const jobId = params.get("job_id");
  const from = params.get("from");
  const to = params.get("to");
  const limit = Math.min(
    Math.max(parseInt(params.get("limit") ?? "20", 10) || 20, 1),
    100
  );

  let query = supabase
    .from("trend_analysis")
    .select(
      `
      *,
      jobs!inner (
        job_id,
        company_name,
        product_name,
        product_category,
        target_icp,
        target_country,
        competitor_accounts,
        status
      )
    `
    )
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (platform) {
    query = query.eq("platform", platform);
  }
  if (jobId) {
    query = query.eq("job_id", jobId);
  }
  if (from) {
    query = query.gte("period_start", from);
  }
  if (to) {
    query = query.lte("period_end", to);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ trends: data, count: data?.length ?? 0 });
}
