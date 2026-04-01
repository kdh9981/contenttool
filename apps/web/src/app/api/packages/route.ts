export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/packages — list content packages, optionally filtered by status
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const status = request.nextUrl.searchParams.get("status");

  let query = supabase
    .from("content_packages")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/packages — create a new content package (starts as "draft")
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  const body = await request.json();

  const { job_id, title, content_type, content_body, platform, target_audience, created_by } = body;

  if (!job_id || !title) {
    return NextResponse.json(
      { error: "job_id and title are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("content_packages")
    .insert({
      job_id,
      title,
      content_type: content_type || "brief",
      content_body: content_body || {},
      platform: platform || null,
      target_audience: target_audience || null,
      created_by: created_by || "system",
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
