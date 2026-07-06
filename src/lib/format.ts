export function formatPrice(cents: number | null): string {
  if (cents === null) return "–";
  const euros = cents / 100;
  // de-DE, not de-AT: Node's de-AT uses a space as thousands separator,
  // but the conventional Austrian retail notation is "1.199,00".
  return euros.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// Pinned to Europe/Vienna so server (UTC container) and client render the same
// Austrian local time — avoids hydration mismatch and shows the right clock.
const DATE_TIME_FMT = new Intl.DateTimeFormat("de-AT", {
  timeZone: "Europe/Vienna",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(ts: number): string {
  return `${DATE_TIME_FMT.format(new Date(ts))} Uhr`;
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "unter 1 Min";
  if (min < 60) return `${min} Min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std ${m} Min` : `${h} Std`;
}

export function formatRelativeTime(ts: number, now: number): string {
  const diffMin = Math.floor((now - ts) / 60_000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std`;
  const diffD = Math.floor(diffH / 24);
  return diffD === 1 ? "vor 1 Tag" : `vor ${diffD} Tagen`;
}
