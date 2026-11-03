import { spawn } from "node:child_process";
import { InventoryMaintenance } from "./maintenance";
import type { TradingRuntime } from "./runtime";
import { TradingError } from "./types";

/** The child owns an OS lock. PIDs are never persisted or used as ownership evidence. */
export async function ensureMaintainer(runtime: TradingRuntime, entry: string): Promise<void> {
  if (await new InventoryMaintenance(runtime).running()) return;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [entry, "maintain", "--state-dir", runtime.store.directory], {
      detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"], env: process.env,
    });
    const timer = setTimeout(() => { child.kill(); finish(false); }, 30_000);
    const finish = (success: boolean) => {
      clearTimeout(timer);
      child.removeAllListeners();
      if (child.connected) child.disconnect();
      child.unref();
      if (success) resolve();
      else reject(new TradingError("maintainer_unavailable", "The inventory worker did not start. The target is saved; run shield-swap-mcp maintain in a trusted terminal to restart it."));
    };
    child.once("error", () => finish(false));
    child.once("exit", () => finish(false));
    child.once("message", message => finish((message as { ready?: boolean })?.ready === true));
  });
}
