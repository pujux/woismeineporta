import { Impit } from "impit";

// A fetch-compatible function that impersonates Chrome's TLS/HTTP fingerprint.
// Needed for retailers behind Cloudflare (bauhaus.at) that reject the default
// Node fetch handshake. Optionally routes through a proxy (HTTP/HTTPS/SOCKS) —
// used to give a single adapter (MediaMarkt) a clean egress IP via Cloudflare WARP.
export function makeImpitFetch(proxyUrl?: string): typeof fetch {
  let impit: Impit | undefined;
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    impit ??= new Impit({ browser: "chrome", ...(proxyUrl ? { proxyUrl } : {}) });
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
    return impit.fetch(input, {
      method: init?.method as never,
      headers,
      body: init?.body as string | undefined,
    }) as unknown as Promise<Response>;
  }) as typeof fetch;
}

// Default impersonating fetch used by the poller for all adapters. Routes through
// RETAILER_PROXY_URL when set (e.g. a Cloudflare WARP proxy), so a flagged server IP
// can be swapped for a clean egress IP across every retailer at once.
export const impitFetch = makeImpitFetch(process.env.RETAILER_PROXY_URL);
