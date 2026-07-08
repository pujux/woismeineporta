/**
 * Tiny inline price sparkline — no chart lib, server-rendered SVG. Renders nothing
 * with fewer than two points. Line is green when the latest price is at/below the
 * first (cheaper = good for the buyer), amber when it has risen.
 */
export function Sparkline({ points, className }: Readonly<{ points: number[]; className?: string }>) {
  if (points.length < 2) return null;

  const w = 56;
  const h = 16;
  const pad = 1.5;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = (w - 2 * pad) / (points.length - 1);
  const coords = points
    .map((p, i) => {
      const x = pad + i * step;
      const y = pad + (h - 2 * pad) * (1 - (p - min) / range); // higher price → higher on the chart
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const rose = points[points.length - 1] > points[0];
  const stroke = rose ? "text-amber-500 dark:text-amber-400" : "text-green-600 dark:text-green-400";

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={`${stroke} ${className ?? ""}`}
      fill="none"
      aria-hidden
      role="presentation"
    >
      <polyline points={coords} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
