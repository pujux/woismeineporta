import { liveBus } from "@/lib/live-bus";

// Long-lived Server-Sent Events stream: pushes a "change" event whenever the
// poller reports fresh data, so clients refresh only then instead of polling.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        liveBus.off("change", onChange);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const onChange = () => send("event: change\ndata: 1\n\n");
      // Heartbeat comment keeps proxies from dropping an idle connection.
      const heartbeat = setInterval(() => send(": ping\n\n"), 25_000);

      liveBus.on("change", onChange);
      request.signal.addEventListener("abort", cleanup);
      send(": connected\n\n");
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
