import { Impit } from "impit";

// A fetch-compatible function that impersonates Chrome's TLS/HTTP fingerprint.
// Needed for retailers behind Cloudflare (bauhaus.at) that reject the default
// Node fetch handshake. Falls back transparently for all other adapters.
let impit: Impit | undefined;

export const impitFetch: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  impit ??= new Impit({ browser: "chrome" });
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
  return impit.fetch(input, {
    method: init?.method as never,
    headers,
    body: init?.body as string | undefined,
  }) as unknown as Promise<Response>;
}) as typeof fetch;
