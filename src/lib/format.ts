export function formatPrice(cents: number | null): string {
  if (cents === null) return "–";
  const euros = cents / 100;
  // de-DE, not de-AT: Node's de-AT uses a space as thousands separator,
  // but the conventional Austrian retail notation is "1.199,00".
  return (
    euros.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
  );
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
