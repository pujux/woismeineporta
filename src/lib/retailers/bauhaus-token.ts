/**
 * Bauhaus store-level stock lives behind `api.bauhaus`, which requires an
 * Apigee OAuth bearer token. The token is NOT obtainable from the public page
 * data alone — the browser mints it at runtime through a flow behind Cloudflare
 * (see docs/superpowers/specs/2026-07-06-bauhaus-filialen.md). This module
 * abstracts token acquisition so the store fetcher stays testable.
 *
 * Strategies, in order:
 *   1. BAUHAUS_ACCESS_TOKEN env — a token pasted in manually (for validation /
 *      short-lived runs). Simplest way to prove the pipeline end-to-end.
 *   2. TODO: headless-browser mint — drive a real browser (Playwright) to load
 *      the PDP, trigger the reserve flow, and capture the bearer from the
 *      api.bauhaus request; cache it for its ~lifetime and refresh on 401.
 *      This is how letzteklima.com does it. Kept out of the default build so
 *      the app stays a lightweight single container; would run as a separate
 *      worker or an opt-in dependency.
 *
 * Returns null when no token is available → the adapter degrades to
 * online-status-only, exactly as today.
 */
export async function getBauhausToken(): Promise<string | null> {
  const fromEnv = process.env.BAUHAUS_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return null;
}
