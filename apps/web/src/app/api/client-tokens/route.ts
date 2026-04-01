import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

// POST /api/client-tokens — generate a review token for a client
export async function POST(request: NextRequest) {
  const body = await request.json();

  const { job_id, client_name, client_email, expires_in_days } = body;

  if (!job_id || !client_name) {
    return NextResponse.json(
      { error: "Missing required fields: job_id, client_name" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Verify the job exists
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("job_id, company_name")
    .eq("job_id", job_id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const token = randomBytes(32).toString("base64url");
  const expires_at = new Date();
  expires_at.setDate(expires_at.getDate() + (expires_in_days ?? 14));

  const { data, error } = await supabase
    .from("client_tokens")
    .insert({
      token,
      client_name,
      client_email: client_email ?? null,
      job_id,
      expires_at: expires_at.toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      ...data,
      review_url: `/review/${token}`,
    },
    { status: 201 }
  );
}
