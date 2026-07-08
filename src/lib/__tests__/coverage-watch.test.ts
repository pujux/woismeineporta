import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoverageWatchEntity, type AppDb } from "@/db";
import { createTestDb } from "@/db/test-utils";
import { checkCoverage, hasPortaSplitProduct } from "@/lib/coverage-watch";

describe("hasPortaSplitProduct (matcher: product link, not the echoed query)", () => {
  it.each([
    ['<a href="/p/klimasplitgeraet-midea-portasplit-12000-btu/12356554">', true],
    ['<a href="/p/midea-klimaanlage-portasplit-anP7004600334/">', true],
    ["some /p/midea-porta-split-cool/p100407988 link", true],
  ])("detects a real product link: %s", (html) => {
    expect(hasPortaSplitProduct(html as string)).toBe(true);
  });

  it.each([
    ['<title>Suchergebnis: midea portasplit</title> … 0 Treffer', false], // echoed query only
    ['<link rel="canonical" href="/s/midea%20portasplit">', false], // search URL, not a product
    ['<a href="/p/midea-luftkuehler-anP7005974432">', false], // different Midea product
    ["nichts hier", false],
  ])("ignores non-product matches: %s", (html) => {
    expect(hasPortaSplitProduct(html as string)).toBe(false);
  });
});

describe("checkCoverage", () => {
  let db: AppDb;
  const probe = {
    key: "hornbach",
    name: "Hornbach.at",
    url: "https://www.hornbach.at/s/midea%20portasplit",
    matches: hasPortaSplitProduct,
  };
  const PRESENT = '<a href="/p/klimasplitgeraet-midea-portasplit-12000-btu/12356554">PortaSplit</a>';
  const ABSENT = "<title>midea portasplit</title> — leider 0 Treffer";

  beforeEach(async () => {
    db = await createTestDb();
  });

  const fetchOf = (html: string, status = 200) =>
    vi.fn(async () => new Response(html, { status })) as unknown as typeof fetch;

  it("alerts the owner on an absent→present transition and records it", async () => {
    const owner = vi.fn().mockResolvedValue(true);
    await checkCoverage(db, fetchOf(PRESENT), owner, 1000, [probe]);
    expect(owner).toHaveBeenCalledOnce();
    expect(owner.mock.calls[0][0]).toContain("Hornbach.at");
    const row = await db.getRepository(CoverageWatchEntity).findOneByOrFail({ key: "hornbach" });
    expect(row.present).toBe(true);
  });

  it("does not alert when the product is still absent", async () => {
    const owner = vi.fn().mockResolvedValue(true);
    await checkCoverage(db, fetchOf(ABSENT), owner, 1000, [probe]);
    expect(owner).not.toHaveBeenCalled();
    const row = await db.getRepository(CoverageWatchEntity).findOneByOrFail({ key: "hornbach" });
    expect(row.present).toBe(false);
  });

  it("alerts only once (present→present is not re-alerted)", async () => {
    const owner = vi.fn().mockResolvedValue(true);
    await checkCoverage(db, fetchOf(PRESENT), owner, 0, [probe]);
    // A day later, still present → checked again but no new alert.
    await checkCoverage(db, fetchOf(PRESENT), owner, 25 * 3_600_000, [probe]);
    expect(owner).toHaveBeenCalledOnce();
  });

  it("skips a shop that was checked less than a day ago (no fetch)", async () => {
    const owner = vi.fn().mockResolvedValue(true);
    const fetchFn = fetchOf(ABSENT);
    await checkCoverage(db, fetchFn, owner, 1000, [probe]);
    await checkCoverage(db, fetchFn, owner, 1000 + 3_600_000, [probe]); // 1h later, not due
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("on a fetch error, does not advance lastCheckedAt (retries next cycle)", async () => {
    const owner = vi.fn().mockResolvedValue(true);
    const failing = vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    await checkCoverage(db, failing, owner, 1000, [probe]);
    expect(await db.getRepository(CoverageWatchEntity).count()).toBe(0); // nothing recorded
    // next cycle, now succeeding & present → alerts
    await checkCoverage(db, fetchOf(PRESENT), owner, 2000, [probe]);
    expect(owner).toHaveBeenCalledOnce();
  });
});
