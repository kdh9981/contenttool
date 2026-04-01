import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canTransition,
  requiresFeedback,
  type ApprovalStatus,
} from "@/lib/approval-machine";

interface TransitionBody {
  to_status: ApprovalStatus;
  triggered_by: string;
  feedback?: string;
  metadata?: Record<string, unknown>;
}

// POST /api/packages/:id/transition — advance or reject a package
// Atomically validates the transition, updates status, and logs the event.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body: TransitionBody = await request.json();

  const { to_status, triggered_by, feedback, metadata } = body;

  if (!to_status || !triggered_by) {
    return NextResponse.json(
      { error: "to_status and triggered_by are required" },
      { status: 400 }
    );
  }

  // Fetch current package state
  const { data: pkg, error: fetchError } = await supabase
    .from("content_packages")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError) {
    const status = fetchError.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: fetchError.message }, { status });
  }

  const fromStatus = pkg.status as ApprovalStatus;

  // Validate transition
  if (!canTransition(fromStatus, to_status)) {
    return NextResponse.json(
      {
        error: `Invalid transition: ${fromStatus} → ${to_status}`,
        current_status: fromStatus,
      },
      { status: 422 }
    );
  }

  // Require feedback on rejection/revision
  if (requiresFeedback(to_status) && !feedback) {
    return NextResponse.json(
      { error: `Feedback is required when transitioning to ${to_status}` },
      { status: 422 }
    );
  }

  // Atomic: update status + insert event
  const [updateResult, eventResult] = await Promise.all([
    supabase
      .from("content_packages")
      .update({ status: to_status })
      .eq("id", id)
      .eq("status", fromStatus) // optimistic lock — prevents race conditions
      .select()
      .single(),
    supabase
      .from("approval_events")
      .insert({
        package_id: id,
        from_status: fromStatus,
        to_status,
        triggered_by,
        feedback: feedback || null,
        metadata: metadata || {},
      })
      .select()
      .single(),
  ]);

  if (updateResult.error) {
    return NextResponse.json(
      { error: "Status changed concurrently. Retry.", detail: updateResult.error.message },
      { status: 409 }
    );
  }

  return NextResponse.json({
    package: updateResult.data,
    event: eventResult.data,
  });
}
