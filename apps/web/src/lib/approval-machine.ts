/**
 * Approval state machine — defines valid transitions and enforces them.
 *
 * States: draft → internal_review → approved → client_review → final
 *         ↑ rejected ←──────────┘         ↑ revision_requested ←─┘
 */

export type ApprovalStatus =
  | "draft"
  | "internal_review"
  | "approved"
  | "rejected"
  | "client_review"
  | "revision_requested"
  | "final";

// Map each status to its valid next states
const TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  draft: ["internal_review"],
  internal_review: ["approved", "rejected"],
  approved: ["client_review"],
  rejected: ["draft"], // loops back for re-generation
  client_review: ["final", "revision_requested"],
  revision_requested: ["draft"], // client feedback → re-generate
  final: [], // terminal state
};

// These transitions require a feedback message
const FEEDBACK_REQUIRED: Set<ApprovalStatus> = new Set([
  "rejected",
  "revision_requested",
]);

export function canTransition(
  from: ApprovalStatus,
  to: ApprovalStatus
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function requiresFeedback(toStatus: ApprovalStatus): boolean {
  return FEEDBACK_REQUIRED.has(toStatus);
}

export function getValidTransitions(from: ApprovalStatus): ApprovalStatus[] {
  return TRANSITIONS[from] ?? [];
}
