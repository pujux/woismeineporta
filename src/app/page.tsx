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

  return (
    <main className="mx-auto max-w-3xl px-4">
      <LiveRefresh />
      <header className="pt-10 pb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Wo ist meine <span className="text-sky-600">Porta</span>?
        </h1>
        <p className="mt-2 text-slate-600">
          Live-Verfügbarkeit der Midea PortaSplit in Österreich — alle 30 Sekunden geprüft.
        </p>
      </header>

      <section className="grid gap-6 sm:grid-cols-2">
        {statuses.map(({ variant, offers }) => (
          <div key={variant.slug}>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{variant.name}</h2>
              <span className="text-xs text-slate-400">UVP {formatPrice(variant.uvpCents)}</span>
            </div>
            <div className="space-y-2">
              {offers.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
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

      <section className="mt-12">
        <SubscribePanel />
      </section>

      <section className="mt-12">
        <h2 className="mb-1 text-lg font-semibold">In welcher Filiale gibt&apos;s eine?</h2>
        <p className="mb-4 text-sm text-slate-500">
          PLZ eingeben und sehen, welche Märkte in deiner Nähe die PortaSplit lagernd haben.
        </p>
        <StoreFinder />
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-semibold">Verlauf</h2>
        <EventFeed events={events} now={now} />
      </section>
    </main>
  );
}
