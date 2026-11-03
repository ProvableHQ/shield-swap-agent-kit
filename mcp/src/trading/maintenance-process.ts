import { spawn, type ChildProcess } from "node:child_process";
import { InventoryMaintenance } from "./maintenance";
import type { TradingRuntime } from "./runtime";
import { TradingError } from "./types";

export type MaintenanceMode = "attached" | "detached";
export const maintenanceShutdownTimeout = 10_000;

export function maintenanceMode(value: string | undefined): MaintenanceMode {
  if (value === undefined || value === "attached") return "attached";
  if (value === "detached") return "detached";
  throw new TradingError("invalid_arguments", "Maintenance mode must be attached or detached.");
}

/** Owns only the child this MCP server starts; the OS lock excludes other workers. */
export class MaintainerProcess {
  private child?: { process: ChildProcess; exited: Promise<void> };
  private starting?: Promise<void>;
  private stopping?: Promise<void>;
  private closing = false;
  constructor(private readonly runtime: TradingRuntime, private readonly entry: string, private readonly mode: MaintenanceMode = "attached") {}

  start(): Promise<void> {
    if (this.closing) return Promise.reject(new TradingError("maintainer_unavailable", "The MCP server is closing."));
    return this.starting ??= this.launch().finally(() => { this.starting = undefined; });
  }

  private async launch(): Promise<void> {
    if (await new InventoryMaintenance(this.runtime).running()) return;
    if (this.closing) throw new TradingError("maintainer_unavailable", "The MCP server is closing.");
    const child = spawn(process.execPath, [this.entry, "maintain", "--state-dir", this.runtime.store.directory,
      ...(this.mode === "attached" ? ["--parent-attached"] : [])], {
      detached: this.mode === "detached", stdio: ["ignore", "ignore", "ignore", "ipc"], env: process.env,
    });
    const owned = { process: child, exited: new Promise<void>(resolve => {
      child.once("close", () => { if (this.child?.process === child) this.child = undefined; resolve(); });
    }) };
    this.child = owned;
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const timer = setTimeout(() => { child.kill("SIGKILL"); finish(false); }, 30_000);
      const finish = (success: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        child.removeListener("message", ready);
        if (success && !this.closing) {
          if (this.mode === "detached") {
            if (child.connected) child.disconnect();
            child.unref();
            if (this.child === owned) this.child = undefined;
          }
          resolve();
        } else {
          child.kill("SIGKILL");
          reject(new TradingError("maintainer_unavailable", "The inventory worker did not start. The target is saved; retry start_inventory_maintenance after reconnecting."));
        }
      };
      const ready = (message: unknown) => finish((message as { ready?: boolean })?.ready === true);
      child.once("error", () => finish(false));
      child.once("exit", () => finish(false));
      child.once("message", ready);
    });
  }

  stop(): Promise<void> {
    this.closing = true;
    return this.stopping ??= (async () => {
      const child = this.child;
      if (child) {
        const timer = setTimeout(() => child.process.kill("SIGKILL"), maintenanceShutdownTimeout);
        try { child.process.kill("SIGTERM"); await child.exited; }
        finally { clearTimeout(timer); }
      }
      await this.starting?.catch(() => {});
    })();
  }
}

/** IPC closure also catches a killed parent, which cannot send a shutdown signal. */
export function maintainerShutdown(attached: boolean): { signal: AbortSignal; dispose(): void } {
  if (attached && !process.send) throw new TradingError("invalid_arguments", "An attached worker requires its MCP parent's IPC connection.");
  const controller = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const shutdown = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    if (attached) deadline = setTimeout(() => process.exit(1), maintenanceShutdownTimeout).unref();
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, shutdown);
  if (attached) {
    process.once("disconnect", shutdown);
    if (!process.connected) shutdown();
  }
  return { signal: controller.signal, dispose() {
    clearTimeout(deadline);
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.removeListener(signal, shutdown);
    process.removeListener("disconnect", shutdown);
    if (attached && process.connected) process.disconnect();
  } };
}
