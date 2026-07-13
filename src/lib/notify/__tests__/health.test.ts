import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyOwner, ownerAddress } from "@/lib/notify/health";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("ownerAddress", () => {
  it("prefers ADMIN_EMAIL", () => {
    process.env.ADMIN_EMAIL = "ops@example.com";
    process.env.EMAIL_REPLY_TO = "reply@example.com";
    expect(ownerAddress()).toBe("ops@example.com");
  });

  it("falls back to EMAIL_REPLY_TO and unwraps a 'Name <email>' form", () => {
    delete process.env.ADMIN_EMAIL;
    process.env.EMAIL_REPLY_TO = "Julian <julian@pufler.dev>";
    expect(ownerAddress()).toBe("julian@pufler.dev");
  });

  it("returns null when neither is set", () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.EMAIL_REPLY_TO;
    expect(ownerAddress()).toBeNull();
  });
});

describe("notifyOwner", () => {
  it("sends to the owner address and returns true", async () => {
    process.env.ADMIN_EMAIL = "ops@example.com";
    const send = vi.fn().mockResolvedValue(undefined);
    await expect(notifyOwner("subj", "<p>body</p>", send)).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith("ops@example.com", "subj", "<p>body</p>");
  });

  it("no-ops (false) when no owner address is configured", async () => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.EMAIL_REPLY_TO;
    const send = vi.fn();
    await expect(notifyOwner("s", "b", send)).resolves.toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("swallows send errors and returns false (never throws)", async () => {
    process.env.ADMIN_EMAIL = "ops@example.com";
    const send = vi.fn().mockRejectedValue(new Error("scaleway down"));
    await expect(notifyOwner("s", "b", send)).resolves.toBe(false);
  });
});
