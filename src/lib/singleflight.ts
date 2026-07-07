/**
 * Collapses concurrent calls that share a key onto a single in-flight promise.
 *
 * The page is `force-dynamic` and every connected browser refreshes at once when
 * the poller signals a change (SSE). Without this, N browsers trigger N identical
 * DB reads in the same instant; with it, the first read runs and the rest await
 * its promise. Only *in-flight* work is shared, so there's no staleness — once the
 * read resolves, the next request runs fresh.
 */
const inflight = new Map<string, Promise<unknown>>();

export function singleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
