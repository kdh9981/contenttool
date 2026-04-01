"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PLATFORMS = ["tiktok", "instagram", "facebook", "youtube"] as const;

export default function NewJobPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    ...PLATFORMS,
  ]);

  function togglePlatform(p: string) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    const competitors = (form.get("competitor_accounts") as string)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      company_name: form.get("company_name"),
      product_name: form.get("product_name"),
      product_category: form.get("product_category"),
      target_icp: form.get("target_icp"),
      target_country: form.get("target_country"),
      competitor_accounts: competitors,
      analysis_period_start: form.get("analysis_period_start"),
      analysis_period_end: form.get("analysis_period_end"),
      platforms: selectedPlatforms,
    };

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create job");
      setSubmitting(false);
      return;
    }

    const job = await res.json();
    router.push(`/jobs/${job.job_id}`);
  }

  // Default date range: last 7 days
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000)
    .toISOString()
    .split("T")[0];

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Create Analysis Job</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Company & Product */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Company & Product
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Company Name *
              </span>
              <input
                name="company_name"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                placeholder="Acme Corp"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Product Name *
              </span>
              <input
                name="product_name"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                placeholder="Widget Pro"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Product Category *
            </span>
            <input
              name="product_category"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
              placeholder="e.g. SaaS, Beauty, Fitness"
            />
          </label>
        </fieldset>

        {/* Targeting */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Targeting
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Target ICP *
              </span>
              <input
                name="target_icp"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                placeholder="e.g. Gen Z women 18-25"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Target Country *
              </span>
              <input
                name="target_country"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                placeholder="e.g. US, KR, JP"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Competitor Accounts
            </span>
            <input
              name="competitor_accounts"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
              placeholder="@competitor1, @competitor2 (comma-separated)"
              defaultValue=""
            />
          </label>
        </fieldset>

        {/* Analysis Period */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Analysis Period
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Start Date *
              </span>
              <input
                name="analysis_period_start"
                type="date"
                required
                defaultValue={weekAgo}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                End Date *
              </span>
              <input
                name="analysis_period_end"
                type="date"
                required
                defaultValue={today}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
              />
            </label>
          </div>
        </fieldset>

        {/* Platforms */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Platforms
          </legend>
          <div className="flex gap-3">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors capitalize ${
                  selectedPlatforms.includes(p)
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {selectedPlatforms.length === 0 && (
            <p className="mt-2 text-sm text-red-600">
              Select at least one platform
            </p>
          )}
        </fieldset>

        <div className="pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={submitting || selectedPlatforms.length === 0}
            className="bg-gray-900 text-white px-6 py-2.5 rounded-md text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Creating..." : "Create Job"}
          </button>
        </div>
      </form>
    </div>
  );
}
