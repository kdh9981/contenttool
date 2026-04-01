"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewLandingPage() {
  const router = useRouter();
  const [token, setToken] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = token.trim();
    if (trimmed) {
      router.push(`/review/${trimmed}`);
    }
  }

  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Content Review Portal</h1>
      <p className="text-gray-500 mt-2 mb-8">
        Enter your review token or use the link provided by the team.
      </p>
      <form onSubmit={handleSubmit} className="max-w-sm mx-auto flex gap-2">
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste your review token..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
        >
          Go
        </button>
      </form>
    </div>
  );
}
