import Link from "next/link";

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-gray-900 text-white flex flex-col">
      <div className="px-4 py-5 border-b border-gray-700">
        <Link href="/" className="text-lg font-bold tracking-tight">
          ContentTool
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          Jobs
        </Link>
        <Link
          href="/jobs/new"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Job
        </Link>
      </nav>
      <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-400">
        Phase 1 — Internal
      </div>
    </aside>
  );
}

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Sidebar />
      <main className="ml-56 min-h-screen">{children}</main>
    </>
  );
}
