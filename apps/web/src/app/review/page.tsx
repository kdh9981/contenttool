"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ContentPackage {
  id: string;
  title: string;
  status: string;
  content_type: string;
  platform: string | null;
  created_by: string | null;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  internal_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
  client_review: "bg-blue-100 text-blue-800",
  revision_requested: "bg-orange-100 text-orange-800",
  final: "bg-emerald-100 text-emerald-800",
};

const TABS = [
  { label: "Pending Review", status: "internal_review" },
  { label: "Approved", status: "approved" },
  { label: "Rejected", status: "rejected" },
  { label: "All", status: "" },
] as const;

export default function ReviewQueuePage() {
  const [packages, setPackages] = useState<ContentPackage[]>([]);
  const [activeTab, setActiveTab] = useState("internal_review");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = activeTab
      ? `/api/packages?status=${activeTab}`
      : "/api/packages";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setPackages(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeTab]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">Internal Review Queue</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.status}
            onClick={() => setActiveTab(tab.status)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab.status
                ? "bg-white border border-b-white -mb-[1px] text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Package list */}
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : packages.length === 0 ? (
        <p className="text-gray-400">No packages in this view.</p>
      ) : (
        <div className="space-y-3">
          {packages.map((pkg) => (
            <Link
              key={pkg.id}
              href={`/review/${pkg.id}`}
              className="block border rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{pkg.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {pkg.content_type}
                    {pkg.platform && ` · ${pkg.platform}`}
                    {pkg.created_by && ` · by ${pkg.created_by}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      STATUS_COLORS[pkg.status] || "bg-gray-100"
                    }`}
                  >
                    {pkg.status.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(pkg.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
