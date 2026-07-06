"use client";

import { useEffect, useState } from "react";

const VARIANTS = [
  { slug: "portasplit", label: "PortaSplit" },
  { slug: "portasplit-cool", label: "PortaSplit Cool" },
] as const;

const RADII = [10, 25, 50, 100] as const;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
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
  const isStandalone =
    typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;

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
        setPushError("Push konnte nicht aktiviert werden. " + String(err));
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

  async function subscribeEmail(e: React.FormEvent) {
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
    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
      <h2 className="text-lg font-semibold">🔔 Sofort-Alarm, wenn&apos;s eine gibt</h2>
      <p className="mt-1 text-sm text-slate-600">
        Wir sagen dir binnen Sekunden Bescheid, sobald eine PortaSplit wieder bestellbar ist.
      </p>

      <div className="mt-4 flex flex-wrap gap-4">
        {VARIANTS.map((v) => (
          <label key={v.slug} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={variants.includes(v.slug)}
              onChange={(e) =>
                setVariants((prev) =>
                  e.target.checked ? [...prev, v.slug] : prev.filter((s) => s !== v.slug),
                )
              }
              className="h-4 w-4 accent-sky-600"
            />
            {v.label}
          </label>
        ))}
      </div>

      <details className="mt-3" open={storeAlert}>
        <summary
          className="cursor-pointer text-sm text-sky-700"
          onClick={(e) => {
            e.preventDefault();
            setStoreAlert((s) => !s);
          }}
        >
          {storeAlert ? "▾" : "▸"} Filial-Alarm (optional): auch melden, wenn ein Markt in deiner
          Nähe Bestand hat
        </summary>
        {storeAlert && (
          <div className="mt-2 flex items-center gap-2">
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              placeholder="PLZ"
              aria-label="PLZ für Filial-Alarm"
              className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <select
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              aria-label="Radius für Filial-Alarm"
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </div>
        )}
      </details>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          {pushState === "subscribed" ? (
            <div className="text-sm">
              <span className="font-medium text-green-700">Push-Alarm aktiv ✓</span>
              <button onClick={disablePush} className="ml-3 text-slate-500 underline">
                Deaktivieren
              </button>
            </div>
          ) : pushState === "denied" ? (
            <p className="text-sm text-slate-500">
              Push ist in deinem Browser blockiert — erlaube Benachrichtigungen in den
              Website-Einstellungen.
            </p>
          ) : pushState === "unsupported" ? (
            <p className="text-sm text-slate-500">Dein Browser unterstützt keine Push-Benachrichtigungen.</p>
          ) : (
            <button
              onClick={enablePush}
              disabled={pushState === "loading"}
              className="w-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50 sm:w-auto"
            >
              {pushState === "loading" ? "…" : "🔔 Push-Alarm aktivieren"}
            </button>
          )}
          {pushError && <p className="mt-1 text-xs text-red-600">{pushError}</p>}
          {isIos && !isStandalone && pushState !== "subscribed" && (
            <p className="mt-1 text-xs text-slate-500">
              iPhone/iPad: Zuerst über „Teilen → Zum Home-Bildschirm" installieren, dann Push
              aktivieren.
            </p>
          )}
        </div>

        <form onSubmit={subscribeEmail} className="flex flex-1 gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="oder per E-Mail"
            aria-label="E-Mail-Adresse"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={emailState === "sending"}
            className="rounded-lg border border-sky-600 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
          >
            {emailState === "sending" ? "…" : "Benachrichtigen"}
          </button>
        </form>
      </div>
      {emailState === "sent" && (
        <p className="mt-2 text-sm text-green-700">
          Bestätigungs-Mail verschickt — bitte Postfach checken (auch Spam). ✓
        </p>
      )}
      {emailState === "error" && (
        <p className="mt-2 text-sm text-red-600">Das hat nicht geklappt — E-Mail-Adresse prüfen und nochmal versuchen.</p>
      )}
    </div>
  );
}
