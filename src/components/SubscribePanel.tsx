"use client";

import { useEffect, useState } from "react";

const VARIANTS = [
  { slug: "portasplit", label: "PortaSplit" },
  { slug: "portasplit-cool", label: "PortaSplit Cool" },
] as const;

const RADII = [10, 25, 50, 100] as const;

const INPUT_CLASSES =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = "unsupported" | "idle" | "subscribed" | "denied" | "loading";

export function SubscribePanel() {
  const [variants, setVariants] = useState<string[]>(VARIANTS.map((v) => v.slug));
  const [storeAlert, setStoreAlert] = useState(false);
  const [zip, setZip] = useState("");
  const [radiusKm, setRadiusKm] = useState<number>(50);

  const [pushState, setPushState] = useState<PushState>("loading");
  const [pushError, setPushError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const isIos = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isStandalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setPushState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setPushState(sub ? "subscribed" : Notification.permission === "denied" ? "denied" : "idle");
      } catch {
        setPushState("unsupported");
      }
    })();
  }, []);

  function prefs() {
    return {
      variantSlugs: variants,
      ...(storeAlert && /^\d{4}$/.test(zip) ? { zip, radiusKm } : {}),
    };
  }

  async function enablePush() {
    setPushError(null);
    if (variants.length === 0) {
      setPushError("Bitte mindestens eine Variante wählen.");
      return;
    }
    setPushState("loading");
    try {
      const keyRes = await fetch("/api/push-key");
      if (!keyRes.ok) throw new Error("push not configured");
      const { publicKey } = await keyRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
      const json = sub.toJSON();
      const res = await fetch("/api/subscribe/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, ...prefs() }),
      });
      if (!res.ok) throw new Error("server rejected");
      setPushState("subscribed");
    } catch (err) {
      if (Notification.permission === "denied") {
        setPushState("denied");
      } else {
        setPushState("idle");
        setPushError("Hat nicht geklappt — bitte probier's nochmal.");
        console.error("push subscribe failed:", err);
      }
    }
  }

  async function disablePush() {
    setPushState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/subscribe/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
    } finally {
      setPushState("idle");
    }
  }

  async function subscribeEmail(e: React.SyntheticEvent) {
    e.preventDefault();
    if (variants.length === 0) return;
    setEmailState("sending");
    try {
      const res = await fetch("/api/subscribe/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...prefs() }),
      });
      setEmailState(res.ok ? "sent" : "error");
    } catch {
      setEmailState("error");
    }
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-linear-to-b from-sky-50 to-white p-5 shadow-sm dark:border-sky-900/60 dark:from-sky-950/60 dark:to-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">🔔 Keine PortaSplit mehr verpassen</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Sobald sie wieder bestellbar ist, sagen wir dir Bescheid — meist innerhalb einer Minute, per Push oder E-Mail. Gratis und jederzeit
        abbestellbar.
      </p>

      <p className="mt-4 mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Für welche Modelle?</p>
      <div className="flex flex-wrap gap-4">
        {VARIANTS.map((v) => (
          <label key={v.slug} className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={variants.includes(v.slug)}
              onChange={(e) => setVariants((prev) => (e.target.checked ? [...prev, v.slug] : prev.filter((s) => s !== v.slug)))}
              className="h-4 w-4 accent-sky-600"
            />
            {v.label}
          </label>
        ))}
      </div>

      <details className="group mt-3" onToggle={(e) => setStoreAlert(e.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 [&::-webkit-details-marker]:hidden">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-90"
            aria-hidden
          >
            <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Zusätzlich Filialen in der Nähe (optional)
        </summary>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Online-Restocks bekommst du ohnehin. Mit einer PLZ melden wir dir <em>zusätzlich</em>, sobald ein Markt im Umkreis eine lagernd hat.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="PLZ"
            aria-label="PLZ für Filial-Alarm"
            className={`w-24 ${INPUT_CLASSES}`}
          />
          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            aria-label="Radius für Filial-Alarm"
            className={`${INPUT_CLASSES} select-chevron appearance-none pr-9`}
          >
            {RADII.map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
        </div>
      </details>

      <div className="mt-5">
        {/* Primary path: Web Push */}
        {pushState === "subscribed" ? (
          <div className="text-sm">
            <span className="font-medium text-green-700 dark:text-green-400">Push-Alarm ist aktiv — wir melden uns! ✓</span>
            <button
              onClick={disablePush}
              className="ml-3 text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Deaktivieren
            </button>
          </div>
        ) : pushState === "denied" ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Push ist in deinem Browser blockiert — erlaube Benachrichtigungen in den Website-Einstellungen.
          </p>
        ) : pushState === "unsupported" ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Dein Browser kann keine Push-Nachrichten — nimm einfach den E-Mail-Alarm unten.
          </p>
        ) : (
          <button
            onClick={enablePush}
            disabled={pushState === "loading"}
            className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 disabled:opacity-50"
          >
            {pushState === "loading" ? "…" : "🔔 Push-Alarm aktivieren"}
          </button>
        )}
        {pushError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{pushError}</p>}
        {isIos && !isStandalone && pushState !== "subscribed" && (
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            iPhone/iPad: Zuerst über „Teilen → Zum Home-Bildschirm&quot; installieren, dann Push aktivieren.
          </p>
        )}

        {/* Secondary path: e-mail */}
        <div className="my-3 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /> oder per E-Mail{" "}
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>
        <form onSubmit={subscribeEmail} className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="deine@email.at"
            aria-label="E-Mail-Adresse"
            className={`min-w-0 flex-1 ${INPUT_CLASSES}`}
          />
          <button
            type="submit"
            disabled={emailState === "sending"}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {emailState === "sending" ? "…" : "Aktivieren"}
          </button>
        </form>
        {emailState === "sent" && (
          <p className="mt-2 text-sm text-green-700 dark:text-green-400">
            Fast geschafft! Wir haben dir eine Bestätigungs-Mail geschickt — kurz bestätigen (auch im Spam-Ordner schauen), dann ist der Alarm scharf.
            ✓
          </p>
        )}
        {emailState === "error" && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">Das hat nicht geklappt — E-Mail-Adresse prüfen und nochmal probieren.</p>
        )}
      </div>
    </div>
  );
}
