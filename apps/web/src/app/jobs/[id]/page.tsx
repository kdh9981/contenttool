"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, use } from "react";

type VideoRecord = {
  record_id: string;
  platform: string;
  video_id: string;
  video_url: string;
  creator_username: string | null;
  like_count: number;
  comment_count: number;
  share_count: number;
  view_count: number;
  caption: string | null;
  published_at: string | null;
  media_type: string | null;
};

type TrendAnalysis = {
  analysis_id: string;
  platform: string;
  top_videos: string[];
  top_hashtags: string[];
  top_content_themes: string[];
  avg_like_count: number | null;
  avg_view_count: number | null;
  avg_comment_count: number | null;
  content_brief: string | null;
  engagement_score_formula: string;
};

type Job = {
  job_id: string;
  company_name: string;
  product_name: string;
  product_category: string;
  target_icp: string;
  target_country: string;
  competitor_accounts: string[];
  analysis_period_start: string;
  analysis_period_end: string;
  platforms: string[];
  status: string;
  created_at: string;
};

type JobDetail = {
  job: Job;
  video_records: VideoRecord[];
  trend_analysis: TrendAnalysis[];
};

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-800",
  running: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);

  const fetchJob = useCallback(async () => {
    const res = await fetch(`/api/jobs/${id}`);
    if (!res.ok) {
      setError("Job not found");
      setLoading(false);
      return;
    }
    const detail: JobDetail = await res.json();
    setData(detail);
    if (!activePlatform && detail.trend_analysis.length > 0) {
      setActivePlatform(detail.trend_analysis[0].platform);
    }
    setLoading(false);
  }, [id, activePlatform]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  if (loading) {
    return (
      <div className="p-8 text-gray-500">Loading...</div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <p className="text-red-600">{error ?? "Unknown error"}</p>
        <Link href="/" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { job, video_records, trend_analysis } = data;
  const activeAnalysis = trend_analysis.find(
    (a) => a.platform === activePlatform
  );

  // Group videos by platform
  const videosByPlatform: Record<string, VideoRecord[]> = {};
  for (const v of video_records) {
    (videosByPlatform[v.platform] ??= []).push(v);
  }
  const activeVideos = activePlatform
    ? videosByPlatform[activePlatform] ?? []
    : video_records;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
        >
          &larr; Back to Jobs
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-bold">{job.company_name}</h1>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
              STATUS_COLORS[job.status] ?? ""
            }`}
          >
            {job.status}
          </span>
        </div>
        <p className="text-gray-500 text-sm mt-1">
          {job.product_name} &middot; {job.product_category} &middot;{" "}
          {job.target_country} &middot; ICP: {job.target_icp}
        </p>
        <p className="text-gray-400 text-xs mt-1">
          Period: {job.analysis_period_start} → {job.analysis_period_end} &middot;
          Created {new Date(job.created_at).toLocaleString()}
        </p>
      </div>

      {/* No results yet */}
      {trend_analysis.length === 0 && video_records.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
          {job.status === "queued" || job.status === "running" ? (
            <>
              <p className="text-lg font-medium">Analysis in progress...</p>
              <p className="text-sm mt-1">
                Results will appear here once the pipeline completes.
              </p>
            </>
          ) : (
            <p>No results available for this job.</p>
          )}
        </div>
      )}

      {/* Platform tabs */}
      {trend_analysis.length > 0 && (
        <>
          <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
            {trend_analysis.map((a) => (
              <button
                key={a.platform}
                onClick={() => setActivePlatform(a.platform)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                  activePlatform === a.platform
                    ? "bg-white shadow-sm text-gray-900"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {a.platform}
              </button>
            ))}
          </div>

          {/* Engagement summary */}
          {activeAnalysis && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase">
                  Avg Views
                </p>
                <p className="text-2xl font-bold mt-1">
                  {activeAnalysis.avg_view_count
                    ? formatNumber(activeAnalysis.avg_view_count)
                    : "—"}
                </p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase">
                  Avg Likes
                </p>
                <p className="text-2xl font-bold mt-1">
                  {activeAnalysis.avg_like_count
                    ? formatNumber(activeAnalysis.avg_like_count)
                    : "—"}
                </p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase">
                  Avg Comments
                </p>
                <p className="text-2xl font-bold mt-1">
                  {activeAnalysis.avg_comment_count
                    ? formatNumber(activeAnalysis.avg_comment_count)
                    : "—"}
                </p>
              </div>
            </div>
          )}

          {/* Content Brief */}
          {activeAnalysis?.content_brief && (
            <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                AI Content Brief
              </h2>
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {activeAnalysis.content_brief}
              </div>
            </div>
          )}

          {/* Top Hashtags & Themes */}
          {activeAnalysis && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              {activeAnalysis.top_hashtags.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Top Hashtags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {activeAnalysis.top_hashtags.map((h, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs"
                      >
                        #{typeof h === "string" ? h : JSON.stringify(h)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {activeAnalysis.top_content_themes.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Content Themes
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {activeAnalysis.top_content_themes.map((t, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs"
                      >
                        {typeof t === "string" ? t : JSON.stringify(t)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Video Records Table */}
      {activeVideos.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Top Videos{activePlatform ? ` — ${activePlatform}` : ""} (
              {activeVideos.length})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2 font-medium text-gray-500">
                  Creator
                </th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">
                  Caption
                </th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">
                  Views
                </th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">
                  Likes
                </th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">
                  Comments
                </th>
                <th className="text-right px-4 py-2 font-medium text-gray-500">
                  Shares
                </th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {activeVideos.slice(0, 20).map((v) => (
                <tr
                  key={v.record_id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-2">
                    <a
                      href={v.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {v.creator_username || "—"}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-gray-700 max-w-xs truncate">
                    {v.caption || "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-700">
                    {formatNumber(v.view_count)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-700">
                    {formatNumber(v.like_count)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-700">
                    {formatNumber(v.comment_count)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-700">
                    {formatNumber(v.share_count)}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs capitalize">
                    {v.media_type || "—"}
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
