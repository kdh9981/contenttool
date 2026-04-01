export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/jobs — create a new analysis job
export async function POST(request: NextRequest) {
  const body = await request.json();

  const required = [
    "company_name",
    "product_name",
    "product_category",
    "target_icp",
    "target_country",
    "analysis_period_start",
    "analysis_period_end",
  ] as const;

  const missing = required.filter((f) => !body[f]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate date formats (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  for (const field of ["analysis_period_start", "analysis_period_end"] as const) {
    if (!dateRegex.test(body[field]) || isNaN(Date.parse(body[field]))) {
      return NextResponse.json(
        { error: `Invalid date format for ${field}. Expected YYYY-MM-DD.` },
        { status: 400 }
      );
    }
  }

  // Validate date range
  if (body.analysis_period_end < body.analysis_period_start) {
    return NextResponse.json(
      { error: "analysis_period_end must be >= analysis_period_start" },
      { status: 400 }
    );
  }

  // Validate platform values
  const validPlatforms = new Set(["tiktok", "instagram", "facebook", "youtube"]);
  const platforms: string[] = body.platforms ?? ["tiktok", "instagram", "facebook", "youtube"];
  const invalidPlatforms = platforms.filter((p: string) => !validPlatforms.has(p));
  if (invalidPlatforms.length > 0) {
    return NextResponse.json(
      { error: `Invalid platform(s): ${invalidPlatforms.join(", ")}. Valid: ${Array.from(validPlatforms).join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      company_name: body.company_name,
      product_name: body.product_name,
      product_category: body.product_category,
      target_icp: body.target_icp,
      target_country: body.target_country,
      competitor_accounts: body.competitor_accounts ?? [],
      analysis_period_start: body.analysis_period_start,
      analysis_period_end: body.analysis_period_end,
      platforms: body.platforms ?? [
        "tiktok",
        "instagram",
        "facebook",
        "youtube",
      ],
      status: "queued",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// GET /api/jobs — list all jobs
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

  const supabase = createAdminClient();

  let query = supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
