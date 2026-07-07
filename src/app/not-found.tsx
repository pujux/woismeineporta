import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-sky-600 dark:text-sky-400">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Seite nicht gefunden</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Diese Seite gibt&apos;s nicht (mehr). Zurück zur PortaSplit-Verfügbarkeit:</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500"
      >
        Zur Startseite
      </Link>
    </main>
  );
}
