"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const PLATFORMS = ["youtube", "tiktok", "instagram", "facebook"] as const;
const ENABLED_PLATFORMS = new Set(["youtube"]);

const FIELD_TOOLTIPS: Record<string, string> = {
  company_name: "Your company or brand name",
  product_name: "The specific product you want to promote",
  product_category: "Industry or category (e.g., SaaS, Beauty, Fitness)",
  target_icp:
    "Ideal Customer Profile — who you want to reach (e.g., Gen Z women 18-25)",
  target_country:
    "Target market countries (e.g., US, Korea, Japan). Free-text accepted.",
  competitor_companies:
    "Competitor brand names to benchmark against (comma-separated)",
};

function Tooltip({ text }: { text: string }) {
  return (
    <span className="relative group ml-1 inline-flex items-center">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold cursor-help leading-none">
        i
      </span>
      <span className="absolute left-6 top-1/2 -translate-y-1/2 z-10 hidden group-hover:block w-56 px-3 py-2 text-xs text-white bg-gray-800 rounded-md shadow-lg">
        {text}
      </span>
    </span>
  );
}

function FieldLabel({
  label,
  required,
  tooltipKey,
}: {
  label: string;
  required?: boolean;
  tooltipKey: string;
}) {
  return (
    <span className="text-sm font-medium text-gray-700 inline-flex items-center">
      {label}
      {required && " *"}
      {FIELD_TOOLTIPS[tooltipKey] && (
        <Tooltip text={FIELD_TOOLTIPS[tooltipKey]} />
      )}
    </span>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <legend className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-3 pb-2 border-b border-gray-200 w-full">
      {children}
    </legend>
  );
}

export default function NewJobPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [hasSuggested, setHasSuggested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "youtube",
  ]);
  const [highlightedFields, setHighlightedFields] = useState<Set<string>>(
    new Set()
  );

  const formRef = useRef<HTMLFormElement>(null);

  function togglePlatform(p: string) {
    if (!ENABLED_PLATFORMS.has(p)) return;
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  function setQuickPeriod(days: number) {
    if (!formRef.current) return;
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 86400000);
    const startEl = formRef.current.elements.namedItem(
      "analysis_period_start"
    ) as HTMLInputElement;
    const endEl = formRef.current.elements.namedItem(
      "analysis_period_end"
    ) as HTMLInputElement;
    if (startEl) startEl.value = startDate.toISOString().split("T")[0];
    if (endEl) endEl.value = endDate.toISOString().split("T")[0];
  }

  async function handleSuggest() {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    const companyName = (form.get("company_name") as string)?.trim();
    const productName = (form.get("product_name") as string)?.trim();
    const productCategory = (form.get("product_category") as string)?.trim();

    if (!companyName || !productName || !productCategory) {
      setError(
        "Please fill in Company Name, Product Name, and Product Category before suggesting."
      );
      return;
    }

    setSuggesting(true);
    setError(null);

    try {
      const res = await fetch("/api/suggest-targeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, productName, productCategory }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to get suggestions");
        return;
      }

      const suggestions = await res.json();
      const f = formRef.current;

      const filled: string[] = [];

      if (suggestions.targetIcp) {
        const el = f.elements.namedItem("target_icp") as HTMLInputElement;
        if (el) {
          el.value = suggestions.targetIcp;
          filled.push("target_icp");
        }
      }
      if (suggestions.targetCountry) {
        const el = f.elements.namedItem("target_country") as HTMLInputElement;
        if (el) {
          el.value = suggestions.targetCountry;
          filled.push("target_country");
        }
      }
      if (suggestions.competitorCompanies) {
        const el = f.elements.namedItem(
          "competitor_companies"
        ) as HTMLInputElement;
        if (el) {
          el.value = suggestions.competitorCompanies;
          filled.push("competitor_companies");
        }
      }
      if (suggestions.analysisPeriodDays) {
        const days = Number(suggestions.analysisPeriodDays);
        if (days > 0) {
          const endDate = new Date();
          const startDate = new Date(Date.now() - days * 86400000);
          const startEl = f.elements.namedItem(
            "analysis_period_start"
          ) as HTMLInputElement;
          const endEl = f.elements.namedItem(
            "analysis_period_end"
          ) as HTMLInputElement;
          if (startEl) {
            startEl.value = startDate.toISOString().split("T")[0];
            filled.push("analysis_period_start");
          }
          if (endEl) {
            endEl.value = endDate.toISOString().split("T")[0];
            filled.push("analysis_period_end");
          }
        }
      }

      setHighlightedFields(new Set(filled));
      setHasSuggested(true);

      setTimeout(() => setHighlightedFields(new Set()), 2000);
    } catch {
      setError("Failed to connect to suggestion service");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);

    const competitors = (form.get("competitor_companies") as string)
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

  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000)
    .toISOString()
    .split("T")[0];

  const inputClass = (fieldName: string) =>
    `mt-1 block w-full rounded-md border px-3 py-2 text-sm outline-none transition-all duration-500 ${
      highlightedFields.has(fieldName)
        ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
        : "border-gray-300 focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
    }`;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-8">Create Analysis Job</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-8">
        {/* Company & Product */}
        <fieldset className="space-y-4">
          <SectionHeader>Company &amp; Product</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <FieldLabel
                label="Company Name"
                required
                tooltipKey="company_name"
              />
              <input
                name="company_name"
                required
                className={inputClass("company_name")}
                placeholder="Acme Corp"
              />
            </label>
            <label className="block">
              <FieldLabel
                label="Product Name"
                required
                tooltipKey="product_name"
              />
              <input
                name="product_name"
                required
                className={inputClass("product_name")}
                placeholder="Widget Pro"
              />
            </label>
          </div>
          <label className="block">
            <FieldLabel
              label="Product Category"
              required
              tooltipKey="product_category"
            />
            <input
              name="product_category"
              required
              className={inputClass("product_category")}
              placeholder="e.g. SaaS, Beauty, Fitness"
            />
          </label>

          {/* Suggest Targeting Button */}
          <button
            type="button"
            onClick={handleSuggest}
            disabled={suggesting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {suggesting ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Suggesting...
              </>
            ) : (
              <>
                {hasSuggested
                  ? "\u2728 Re-suggest Targeting"
                  : "\u2728 Suggest Targeting"}
              </>
            )}
          </button>
        </fieldset>

        {/* Targeting */}
        <fieldset className="space-y-4">
          <SectionHeader>Targeting</SectionHeader>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <FieldLabel
                label="Target ICP"
                required
                tooltipKey="target_icp"
              />
              <input
                name="target_icp"
                required
                className={inputClass("target_icp")}
                placeholder="e.g. Gen Z women 18-25"
              />
            </label>
            <label className="block">
              <FieldLabel
                label="Target Country"
                required
                tooltipKey="target_country"
              />
              <input
                name="target_country"
                required
                className={inputClass("target_country")}
                placeholder="e.g. US, KR, JP"
              />
            </label>
          </div>
          <label className="block">
            <FieldLabel
              label="Competitor Companies"
              tooltipKey="competitor_companies"
            />
            <input
              name="competitor_companies"
              className={inputClass("competitor_companies")}
              placeholder="Nike, Adidas, Puma (comma-separated)"
              defaultValue=""
            />
          </label>
        </fieldset>

        {/* Analysis Period */}
        <fieldset className="space-y-4">
          <SectionHeader>Analysis Period</SectionHeader>
          <div className="flex gap-2 mb-2">
            {[
              { label: "Last 7 days", days: 7 },
              { label: "Last 30 days", days: 30 },
              { label: "Last 90 days", days: 90 },
            ].map(({ label, days }) => (
              <button
                key={days}
                type="button"
                onClick={() => setQuickPeriod(days)}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
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
                className={inputClass("analysis_period_start")}
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
                className={inputClass("analysis_period_end")}
              />
            </label>
          </div>
        </fieldset>

        {/* Platforms */}
        <fieldset>
          <SectionHeader>Platforms</SectionHeader>
          <div className="flex gap-3">
            {PLATFORMS.map((p) => {
              const enabled = ENABLED_PLATFORMS.has(p);
              const selected = selectedPlatforms.includes(p);
              return (
                <div key={p} className="relative group">
                  <button
                    type="button"
                    onClick={() => togglePlatform(p)}
                    disabled={!enabled}
                    className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors capitalize ${
                      !enabled
                        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                        : selected
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {p}
                  </button>
                  {!enabled && (
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 z-10 hidden group-hover:block whitespace-nowrap px-2 py-1 text-xs text-white bg-gray-800 rounded shadow-lg">
                      Coming soon
                    </span>
                  )}
                </div>
              );
            })}
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
