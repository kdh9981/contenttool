"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface ApprovalEvent {
  id: string;
  from_status: string;
  to_status: string;
  triggered_by: string;
  feedback: string | null;
  created_at: string;
}

interface PackageDetail {
  id: string;
  job_id: string;
  title: string;
  status: string;
  content_type: string;
  content_body: Record<string, unknown>;
  platform: string | null;
  target_audience: string | null;
  created_by: string | null;
  assigned_reviewer: string | null;
  created_at: string;
  updated_at: string;
  events: ApprovalEvent[];
  valid_transitions: string[];
}

const STATUS_LABELS: Record<string, string> = {
  internal_review: "Submit for Review",
  approved: "Approve",
  rejected: "Reject",
  client_review: "Send to Client",
  revision_requested: "Request Revision",
  draft: "Return to Draft",
  final: "Mark as Final",
};

const NEEDS_FEEDBACK = new Set(["rejected", "revision_requested"]);

export default function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [feedback, setFeedback] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/packages/${id}`)
      .then((r) => r.json())
      .then(setPkg)
      .catch(() => setError("Failed to load package"));
  }, [id]);

  async function handleTransition(toStatus: string) {
    if (NEEDS_FEEDBACK.has(toStatus) && !feedback.trim()) {
      setError("Feedback is required for this action.");
      return;
    }

    setTransitioning(true);
    setError("");

    const res = await fetch(`/api/packages/${id}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to_status: toStatus,
        triggered_by: "internal_reviewer", // TODO: replace with actual user identity
        feedback: feedback || undefined,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      setError(err.error || "Transition failed");
      setTransitioning(false);
      return;
    }

    // Reload package detail
    const updated = await fetch(`/api/packages/${id}`).then((r) => r.json());
    setPkg(updated);
    setFeedback("");
    setTransitioning(false);
  }

  if (!pkg) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-gray-400">{error || "Loading..."}</p>
      </main>
    );
  }

  const briefText =
    typeof pkg.content_body === "object"
      ? (pkg.content_body as Record<string, string>).brief_text ||
        JSON.stringify(pkg.content_body, null, 2)
      : String(pkg.content_body);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <Link href="/review" className="text-sm text-blue-600 hover:underline">
        ← Back to queue
      </Link>

      <h1 className="text-2xl font-bold mt-4 mb-2">{pkg.title}</h1>

      <div className="flex gap-2 text-sm text-gray-500 mb-6">
        <span className="px-2 py-0.5 bg-gray-100 rounded">{pkg.status.replace(/_/g, " ")}</span>
        <span>{pkg.content_type}</span>
        {pkg.platform && <span>· {pkg.platform}</span>}
      </div>

      {/* Content preview */}
      <section className="border rounded-lg p-4 mb-6">
        <h2 className="font-semibold text-sm text-gray-600 mb-2">Content</h2>
        <pre className="whitespace-pre-wrap text-sm text-gray-800 max-h-96 overflow-y-auto">
          {briefText}
        </pre>
      </section>

      {/* Actions */}
      {pkg.valid_transitions.length > 0 && (
        <section className="border rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-sm text-gray-600 mb-3">Actions</h2>

          {/* Feedback input (shown when rejection/revision is possible) */}
          {pkg.valid_transitions.some((t) => NEEDS_FEEDBACK.has(t)) && (
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Add feedback (required for rejection/revision)..."
              className="w-full border rounded p-2 text-sm mb-3 min-h-[80px]"
            />
          )}

          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

          <div className="flex gap-2 flex-wrap">
            {pkg.valid_transitions.map((toStatus) => {
              const isDestructive = toStatus === "rejected" || toStatus === "revision_requested";
              return (
                <button
                  key={toStatus}
                  onClick={() => handleTransition(toStatus)}
                  disabled={transitioning}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50 ${
                    isDestructive
                      ? "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {STATUS_LABELS[toStatus] || toStatus}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Audit trail */}
      <section className="border rounded-lg p-4">
        <h2 className="font-semibold text-sm text-gray-600 mb-3">
          History ({pkg.events.length} events)
        </h2>
        {pkg.events.length === 0 ? (
          <p className="text-sm text-gray-400">No events yet.</p>
        ) : (
          <div className="space-y-3">
            {pkg.events.map((event) => (
              <div key={event.id} className="text-sm border-l-2 border-gray-200 pl-3">
                <div className="text-gray-700">
                  <span className="font-medium">{event.triggered_by}</span>
                  {" moved "}
                  <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                    {event.from_status}
                  </span>
                  {" → "}
                  <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                    {event.to_status}
                  </span>
                </div>
                {event.feedback && (
                  <p className="text-gray-500 mt-1 italic">"{event.feedback}"</p>
                )}
                <p className="text-gray-400 text-xs mt-1">
                  {new Date(event.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
