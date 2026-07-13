import { scalewaySend, type SendFn } from "./email";

/** The owner's alert address: ADMIN_EMAIL, else the bare address from EMAIL_REPLY_TO. */
export function ownerAddress(): string | null {
  const raw = process.env.ADMIN_EMAIL?.trim() || process.env.EMAIL_REPLY_TO?.trim();
  if (!raw) return null;
  return raw.match(/<([^>]+)>/)?.[1] ?? raw;
}

/**
 * Sends an operational alert to the site owner (adapter health, new-coverage
 * pings). Best-effort: returns false and logs if unconfigured or the send fails —
 * never throws, so a poller tick can call it without a guard.
 */
export async function notifyOwner(subject: string, html: string, send: SendFn = scalewaySend): Promise<boolean> {
  const to = ownerAddress();
  if (!to) return false; // ADMIN_EMAIL / EMAIL_REPLY_TO not set — health alerts disabled
  try {
    await send(to, subject, html);
    return true;
  } catch (err) {
    console.error("owner notify failed:", err);
    return false;
  }
}

export type OwnerNotify = (subject: string, html: string) => Promise<unknown>;
