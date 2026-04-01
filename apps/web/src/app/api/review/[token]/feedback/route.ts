import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateToken } from "@/lib/review-auth";

// POST /api/review/:token/feedback — client approves or requests revision
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await validateToken(token);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const body = await request.json();
  const { package_id, action, feedback } = body;

  if (!package_id || !action) {
    return NextResponse.json(
      { error: "Missing required fields: package_id, action" },
      { status: 400 }
    );
  }

  const validActions = ["approve", "request_revision"] as const;
  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Verify the package belongs to the same job as the token
  const { data: pkg, error: pkgError } = await supabase
    .from("content_packages")
    .select("id, job_id, status")
    .eq("id", package_id)
    .single();

  if (pkgError || !pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  if (pkg.job_id !== result.data.job_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (pkg.status !== "client_review") {
    return NextResponse.json(
      { error: `Package is not in client_review status (current: ${pkg.status})` },
      { status: 409 }
    );
  }

  const to_status = action === "approve" ? "final" : "revision_requested";

  // Update package status + log the event in a transaction-like fashion
  const [updateResult, eventResult] = await Promise.all([
    supabase
      .from("content_packages")
      .update({ status: to_status, updated_at: new Date().toISOString() })
      .eq("id", package_id),
    supabase.from("approval_events").insert({
      package_id,
      from_status: "client_review",
      to_status,
      triggered_by: `client:${result.data.client_name}`,
      feedback: feedback ?? null,
    }),
  ]);

  if (updateResult.error || eventResult.error) {
    return NextResponse.json(
      { error: updateResult.error?.message ?? eventResult.error?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ package_id, status: to_status });
}
