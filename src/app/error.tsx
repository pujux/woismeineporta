"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    console.error("page error:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Da ist was schiefgelaufen</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Ein unerwarteter Fehler ist aufgetreten. Bitte probier&apos;s nochmal — die Verfügbarkeitsdaten laufen im Hintergrund weiter.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
      >
        Nochmal versuchen
      </button>
    </main>
  );
}
