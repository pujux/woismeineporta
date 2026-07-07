// Warn (don't crash) if optional-feature env is missing, so misconfig surfaces
// on deploy instead of silently at first use. Push/email just stay disabled.
function warnMissingEnv() {
  const groups: Array<[string, string[]]> = [
    ["Web Push", ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]],
    ["E-Mail (Resend)", ["RESEND_API_KEY", "EMAIL_FROM"]],
    ["Absolute URLs (canonical/OG/e-mail links)", ["PUBLIC_BASE_URL"]],
  ];
  for (const [feature, keys] of groups) {
    const missing = keys.filter((k) => !process.env[k]);
    if (missing.length) console.warn(`[env] ${feature} disabled/degraded — missing: ${missing.join(", ")}`);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV === "production") warnMissingEnv();
    if (process.env.ENABLE_POLLER === "1") {
      const { startPoller } = await import("./lib/poller");
      startPoller();
    }
  }
}
