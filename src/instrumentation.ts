export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ENABLE_POLLER === "1") {
    const { startPoller } = await import("./lib/poller");
    startPoller();
  }
}
