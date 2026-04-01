"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

type Job = {
  job_id: string;
  company_name: string;
  product_name: string;
  product_category: string;
  target_country: string;
  platforms: string[];
  status: "queued" | "running" | "completed" | "failed";
  created_at: string;
  analysis_period_start: string;
  analysis_period_end: string;
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-800",
  running: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

const STATUSES = ["all", "queued", "running", "completed", "failed"] as const;

export default function DashboardPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const qs = filter !== "all" ? `?status=${filter}` : "";
    const res = await fetch(`/api/jobs${qs}`);
    if (res.ok) setJobs(await res.json());
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Analysis Jobs</h1>
        <div className="flex gap-2">
          <Link
            href="/review"
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Review Queue
          </Link>
          <Link
            href="/jobs/new"
            className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            + New Job
          </Link>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              filter === s
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500 py-12 text-center">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="text-gray-500 py-12 text-center">
          No jobs found.{" "}
          <Link href="/jobs/new" className="text-blue-600 hover:underline">
            Create one
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Company</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Product</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Category</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Country</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Platforms</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Period</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.job_id}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/jobs/${job.job_id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {job.company_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{job.product_name}</td>
                  <td className="px-4 py-3 text-gray-700">{job.product_category}</td>
                  <td className="px-4 py-3 text-gray-700">{job.target_country}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {job.platforms.map((p) => (
                        <span
                          key={p}
                          className="px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600 capitalize"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">
                    {job.analysis_period_start} → {job.analysis_period_end}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                        STATUS_COLORS[job.status] ?? ""
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
