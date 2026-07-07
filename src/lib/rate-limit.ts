/**
 * Tiny in-memory fixed-window rate limiter. Single-container only (state lives in
 * this process), which is exactly our deployment. The map is swept on each call so
 * idle keys don't accumulate. Behind Traefik/Dokploy the client IP is in XFF.
 */
export function createRateLimiter(maxPerWindow: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return function rateLimited(key: string, now = Date.now()): boolean {
    for (const [k, times] of hits) {
      const fresh = times.filter((t) => now - t < windowMs);
      if (fresh.length) hits.set(k, fresh);
      else hits.delete(k);
    }
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length > maxPerWindow;
  };
}

/** Best-effort client IP. Trustworthy only behind the reverse proxy that sets XFF. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}
