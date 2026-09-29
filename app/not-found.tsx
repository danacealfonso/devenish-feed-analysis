import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="font-mono text-6xl font-semibold text-navy-900">404</p>
        <h1 className="mt-3 text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-ink-3">The page you’re looking for doesn’t exist or has moved.</p>
        <Link href="/overview" className="mt-6 inline-block rounded-lg bg-navy-900 px-5 py-2.5 font-semibold text-white hover:bg-navy-800">
          Go to the portal
        </Link>
      </div>
    </main>
  );
}
