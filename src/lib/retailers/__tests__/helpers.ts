import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";

const FIXTURES = path.join(__dirname, "..", "__fixtures__");

export function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

/**
 * Builds a fetch stub that serves fixture bodies for URL substring matches.
 * Routes are checked in order; unmatched URLs get a 404 response.
 */
export function fixtureFetch(routes: Array<[urlIncludes: string, body: string, status?: number]>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [needle, body, status = 200] of routes) {
      if (url.includes(needle)) return new Response(body, { status });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}
