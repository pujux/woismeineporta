import { EventEmitter } from "node:events";

/**
 * Process-wide event bus. The in-process poller emits "change" when a tick
 * produces stock/price events; the SSE route (/api/live) subscribes and fans
 * that out to connected browsers so they refresh only when data actually
 * changed. Stored on globalThis so the poller (started from instrumentation)
 * and the route handler share one instance across bundles and dev HMR.
 */
const globalForBus = globalThis as unknown as { __liveBus?: EventEmitter };

export const liveBus: EventEmitter = globalForBus.__liveBus ?? new EventEmitter();
liveBus.setMaxListeners(0); // one listener per open SSE connection

globalForBus.__liveBus ??= liveBus;

export function emitChange(): void {
  liveBus.emit("change");
}
