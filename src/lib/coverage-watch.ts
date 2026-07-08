import { CoverageWatchEntity, type AppDb } from "@/db";
import type { OwnerNotify } from "./notify/health";
import { politeFetch } from "./retailers/fetch";

const COVERAGE_INTERVAL_MS = 24 * 3_600_000; // check each shop at most once a day

interface Probe {
  key: string;
  name: string;
  url: string;
  /** True when the page shows a real PortaSplit *product* (not just the search term). */
  matches: (html: string) => boolean;
}

// A real product link/slug: `/p/…portasplit…`. This deliberately ignores the echoed
// search query (which lands in the title/meta/`?q=` URL, never in a `/p/` product path),
// the trap we hit manually with Lidl/hagebau. NB: SPA storefronts that render results
// client-side (Lidl) won't expose the link in the initial HTML — detection there is
// best-effort and may lag until the product is server-rendered.
export function hasPortaSplitProduct(html: string): boolean {
  return /\/p\/[a-z0-9%._-]*porta-?split/i.test(html);
}

export const COVERAGE_PROBES: Probe[] = [
  { key: "hornbach", name: "Hornbach.at", url: "https://www.hornbach.at/s/midea%20portasplit", matches: hasPortaSplitProduct },
  { key: "hagebau", name: "hagebau.at", url: "https://www.hagebau.at/heizen-klima-klimageraete/midea/", matches: hasPortaSplitProduct },
  { key: "lidl", name: "Lidl.at", url: "https://www.lidl.at/q/query?query=midea+portasplit", matches: hasPortaSplitProduct },
];

/**
 * Checks each not-yet-integrated shop for the PortaSplit appearing, at most once a day
 * per shop. On an absent→present transition, emails the owner so they can add an
 * adapter. Best-effort: fetch errors are logged and retried next cycle (lastCheckedAt
 * isn't advanced), so a transient failure never marks a shop "checked".
 */
export async function checkCoverage(
  db: AppDb,
  fetchFn: typeof fetch,
  ownerNotify: OwnerNotify,
  now: number,
  probes: Probe[] = COVERAGE_PROBES,
): Promise<void> {
  const repo = db.getRepository(CoverageWatchEntity);
  for (const probe of probes) {
    const row = await repo.findOneBy({ key: probe.key });
    if (row && now - row.lastCheckedAt < COVERAGE_INTERVAL_MS) continue; // not due yet

    let present: boolean;
    try {
      const res = await politeFetch(probe.url, { headers: { Accept: "text/html", "Accept-Language": "de-AT,de;q=0.9" } }, fetchFn);
      present = probe.matches(await res.text());
    } catch (err) {
      console.error(`coverage-watch: ${probe.key} check failed:`, err instanceof Error ? err.message : err);
      continue; // don't advance lastCheckedAt → retried next cycle
    }

    const was = row?.present ?? false;
    await repo.upsert(
      { key: probe.key, present, lastCheckedAt: now, lastChangedAt: present !== was ? now : (row?.lastChangedAt ?? now) },
      ["key"],
    );

    if (present && !was) {
      await ownerNotify(
        `🆕 ${probe.name} führt jetzt die PortaSplit`,
        `<p><b>${probe.name}</b> listet jetzt die Midea PortaSplit — Zeit, einen Adapter hinzuzufügen.</p>
         <p><a href="${probe.url}">${probe.url}</a></p>`,
      );
    }
  }
}
