export class AdapterHttpError extends Error {
  readonly name = "AdapterHttpError";
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Accept-Language": "de-AT,de;q=0.9,en;q=0.8",
  Accept: "application/json, text/html;q=0.9, */*;q=0.8",
};

export async function politeFetch(url: string, init?: RequestInit, fetchFn: typeof fetch = fetch): Promise<Response> {
  const headers = new Headers(DEFAULT_HEADERS);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const res = await fetchFn(url, {
    ...init,
    headers,
    signal: init?.signal ?? AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new AdapterHttpError(res.status, url);
  return res;
}
