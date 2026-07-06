import { getDb } from "@/db";
import { getRecentEvents, getVariantStatuses } from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import { EventFeed } from "@/components/EventFeed";
import { LiveRefresh } from "@/components/LiveRefresh";
import { StatusCard } from "@/components/StatusCard";
import { StoreFinder } from "@/components/StoreFinder";
import { SubscribePanel } from "@/components/SubscribePanel";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDb();
  const [statuses, events] = await Promise.all([getVariantStatuses(db), getRecentEvents(db)]);
  const now = Date.now();
  const anyInStock = statuses.some((s) => s.offers.some((o) => o.status === "in_stock"));

  return (
    <main className="mx-auto max-w-3xl px-4">
      <LiveRefresh />
      <header className="pt-12 pb-10 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <span className="h-2 w-2 animate-pulse-dot rounded-full bg-sky-500" aria-hidden />
          Live — alle 30 Sekunden geprüft
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Wo ist meine{" "}
          <span className="bg-gradient-to-r from-sky-500 to-sky-700 bg-clip-text text-transparent dark:from-sky-400 dark:to-sky-600">
            Porta
          </span>
          ?
        </h1>
        <p className="mx-auto mt-3 max-w-md text-slate-600 dark:text-slate-400">
          {anyInStock
            ? "🎉 Es gibt gerade welche — schnell sein!"
            : "Die Midea PortaSplit ist überall ausverkauft. Wir schauen für dich nach — pausenlos."}
        </p>
      </header>

      <section className="grid gap-8 sm:grid-cols-2">
        {statuses.map(({ variant, offers }) => (
          <div key={variant.slug}>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{variant.name}</h2>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                UVP {formatPrice(variant.uvpCents)}
              </span>
            </div>
            <div className="space-y-2.5">
              {offers.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
                  Noch keine Daten — erster Check läuft.
                </p>
              ) : (
                offers.map((offer) => (
                  <StatusCard key={offer.retailerSlug} offer={offer} now={now} />
                ))
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-14">
        <SubscribePanel />
      </section>

      <section className="mt-14">
        <h2 className="mb-1 text-lg font-semibold">In welcher Filiale gibt&apos;s eine?</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          PLZ eingeben und sehen, welche Märkte in deiner Nähe die PortaSplit lagernd haben.
        </p>
        <StoreFinder />
      </section>

      <section className="mt-14">
        <h2 className="mb-4 text-lg font-semibold">Verlauf</h2>
        <EventFeed events={events} now={now} />
      </section>
    </main>
  );
}
