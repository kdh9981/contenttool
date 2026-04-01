"use client";

import { useEffect, useState, useCallback, use } from "react";

type ContentPackage = {
  id: string;
  title: string;
  status: string;
  content_type: string;
  content_body: Record<string, unknown>;
  platform: string | null;
  target_audience: string | null;
  created_at: string;
};

type ReviewData = {
  client_name: string;
  job: {
    job_id: string;
    company_name: string;
    product_name: string;
    product_category: string;
    target_country: string;
    platforms: string[];
    status: string;
  };
  packages: ContentPackage[];
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  client_review: { label: "Awaiting Your Review", color: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", color: "bg-green-100 text-green-800" },
  final: { label: "Final", color: "bg-green-100 text-green-800" },
  revision_requested: { label: "Revision Requested", color: "bg-orange-100 text-orange-800" },
};

export default function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/review/${token}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Invalid or expired review link");
      setLoading(false);
      return;
    }
    setData(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleAction(packageId: string, action: "approve" | "request_revision") {
    setSubmitting(packageId);
    const res = await fetch(`/api/review/${token}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        package_id: packageId,
        action,
        feedback: feedbackText[packageId] || null,
      }),
    });

    if (res.ok) {
      await fetchData();
    }
    setSubmitting(null);
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-gray-500">
        Loading review...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-20 text-center">
        <div className="text-red-600 text-lg font-medium">{error}</div>
        <p className="text-gray-500 text-sm mt-2">
          Please check your review link or contact the team for a new one.
        </p>
      </div>
    );
  }

  const { client_name, job, packages } = data;
  const pendingPackages = packages.filter((p) => p.status === "client_review");
  const decidedPackages = packages.filter((p) => p.status !== "client_review");

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm text-gray-500">
          Welcome, <span className="font-medium text-gray-700">{client_name}</span>
        </p>
        <h1 className="text-2xl font-bold mt-1">
          Content Review — {job.company_name}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {job.product_name} &middot; {job.product_category} &middot; {job.target_country}
        </p>
      </div>

      {packages.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
          <p className="text-lg font-medium">No content ready for review yet</p>
          <p className="text-sm mt-1">
            You&apos;ll see content here once the team sends it for your review.
          </p>
        </div>
      )}

      {/* Pending reviews */}
      {pendingPackages.length > 0 && (
        <div className="mb-10">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Awaiting Your Review ({pendingPackages.length})
          </h2>
          <div className="space-y-4">
            {pendingPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="bg-white rounded-lg border border-amber-200 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{pkg.title}</h3>
                    <div className="flex gap-2 mt-1">
                      {pkg.platform && (
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600 capitalize">
                          {pkg.platform}
                        </span>
                      )}
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                        {pkg.content_type}
                      </span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS.client_review.color}`}>
                    {STATUS_LABELS.client_review.label}
                  </span>
                </div>

                {/* Content body preview */}
                <div className="bg-gray-50 rounded-md p-4 mb-4 text-sm text-gray-700">
                  <ContentPreview body={pkg.content_body} />
                </div>

                {/* Feedback + actions */}
                <textarea
                  placeholder="Add feedback or notes (optional)..."
                  value={feedbackText[pkg.id] ?? ""}
                  onChange={(e) =>
                    setFeedbackText((prev) => ({ ...prev, [pkg.id]: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAction(pkg.id, "approve")}
                    disabled={submitting === pkg.id}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {submitting === pkg.id ? "..." : "Approve"}
                  </button>
                  <button
                    onClick={() => handleAction(pkg.id, "request_revision")}
                    disabled={submitting === pkg.id}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {submitting === pkg.id ? "..." : "Request Revision"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Already decided */}
      {decidedPackages.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Reviewed ({decidedPackages.length})
          </h2>
          <div className="space-y-3">
            {decidedPackages.map((pkg) => {
              const statusInfo = STATUS_LABELS[pkg.status] ?? {
                label: pkg.status,
                color: "bg-gray-100 text-gray-800",
              };
              return (
                <div
                  key={pkg.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 opacity-80"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-700">{pkg.title}</h3>
                      <div className="flex gap-2 mt-1">
                        {pkg.platform && (
                          <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600 capitalize">
                            {pkg.platform}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ContentPreview({ body }: { body: Record<string, unknown> }) {
  if (!body || Object.keys(body).length === 0) {
    return <span className="text-gray-400">No content preview available</span>;
  }

  const copy = body.copy as {
    social_captions?: string[];
    ad_copy?: Array<{ headline?: string; body?: string } | string>;
    video_scripts?: Array<{
      hook?: string;
      body?: string;
      cta?: string;
      duration_seconds?: number;
    }>;
  } | null;

  const imageUrls = (body.image_urls as string[]) ?? [];
  const briefText = body.brief_text as string | undefined;

  return (
    <div className="space-y-6">
      {/* Images */}
      {imageUrls.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Generated Images
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {imageUrls.map((url, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Generated asset ${i + 1}`}
                  className="w-full h-auto object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Social Captions */}
      {copy?.social_captions && copy.social_captions.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Social Captions
          </h4>
          <div className="space-y-2">
            {copy.social_captions.map((caption, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-md p-3 text-sm"
              >
                <span className="text-xs text-gray-400 font-medium">
                  Variant {i + 1}
                </span>
                <p className="mt-1 whitespace-pre-wrap">{caption}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ad Copy */}
      {copy?.ad_copy && copy.ad_copy.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Ad Copy
          </h4>
          <div className="space-y-2">
            {copy.ad_copy.map((ad, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-md p-3 text-sm"
              >
                <span className="text-xs text-gray-400 font-medium">
                  Ad {i + 1}
                </span>
                {typeof ad === "string" ? (
                  <p className="mt-1 whitespace-pre-wrap">{ad}</p>
                ) : (
                  <>
                    {ad.headline && (
                      <p className="mt-1 font-semibold text-gray-900">
                        {ad.headline}
                      </p>
                    )}
                    {ad.body && (
                      <p className="mt-1 text-gray-700 whitespace-pre-wrap">
                        {ad.body}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video Scripts */}
      {copy?.video_scripts && copy.video_scripts.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Video Scripts
          </h4>
          {copy.video_scripts.map((script, i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-md p-3 text-sm space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-medium">
                  Script {i + 1}
                </span>
                {script.duration_seconds && (
                  <span className="text-xs text-gray-400">
                    ~{script.duration_seconds}s
                  </span>
                )}
              </div>
              {script.hook && (
                <div>
                  <span className="text-xs font-medium text-blue-600">
                    Hook (0-3s)
                  </span>
                  <p className="text-gray-800">{script.hook}</p>
                </div>
              )}
              {script.body && (
                <div>
                  <span className="text-xs font-medium text-gray-500">Body</span>
                  <p className="text-gray-700">{script.body}</p>
                </div>
              )}
              {script.cta && (
                <div>
                  <span className="text-xs font-medium text-green-600">CTA</span>
                  <p className="text-gray-800 font-medium">{script.cta}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Brief text (collapsed by default) */}
      {briefText && (
        <details className="group">
          <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700">
            Content Brief
          </summary>
          <div className="mt-2 bg-white border border-gray-200 rounded-md p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
            {briefText}
          </div>
        </details>
      )}
    </div>
  );
}
