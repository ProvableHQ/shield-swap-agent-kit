import { existsSync } from "node:fs";
import { join } from "node:path";
import { argumentsFor, configure, help, setup, stateDirectory } from "./terminal";
import { InventoryMaintenance } from "./trading/maintenance";
import { OperationRecovery } from "./trading/recovery";
import { ensureMaintainer } from "./trading/maintenance-process";
import { LockBusyError } from "./trading/store";
import { TradingError } from "./trading/types";

// SDK diagnostics can include credential-bearing requests. The host owns safe
// diagnostics; stdout is reserved for MCP messages or terminal JSON results.
for (const method of ["log", "info", "warn", "error", "debug", "dir", "table", "trace"] as const) console[method] = () => {};

async function main(): Promise<void> {
  const { command, values } = argumentsFor(process.argv.slice(2));
  if (values.help) { process.stdout.write(help); return; }
  if (command === "setup" || command === "configure") {
    const result = command === "setup" ? await setup(values) : await configure(values);
    process.stdout.write(JSON.stringify(result) + "\n");
    return;
  }
  const [{ StdioServerTransport }, { createTradingServer }, { TradingStore }, { TradingRuntime }, { VeilBackend }] = await Promise.all([
    import("@modelcontextprotocol/sdk/server/stdio.js"), import("./trading/server"),
    import("./trading/store"), import("./trading/runtime"), import("./trading/veil"),
  ]);
  const directory = stateDirectory(values);
  const passphrase = process.env.SHIELD_SWAP_MCP_PASSWORD;
  const stateExists = existsSync(join(directory, "state.sqlite"));
  const store = passphrase && stateExists ? new TradingStore(directory, passphrase) : undefined;
  const runtime = store ? new TradingRuntime(store, new VeilBackend(store)) : undefined;
  if (command === "maintain") {
    if (!runtime || !store) throw new TradingError("setup_required", "Unlock configured state before starting maintenance.");
    const controller = new AbortController();
    process.once("SIGINT", () => controller.abort());
    process.once("SIGTERM", () => controller.abort());
    try {
      await new InventoryMaintenance(runtime).run(controller.signal, () => { process.send?.({ ready: true }); });
    } catch (error) {
      if (error instanceof LockBusyError && process.send) process.send({ ready: true });
      else throw error;
    } finally { await runtime.drain(); store.close(); }
    return;
  }
  const server = createTradingServer(runtime, { stateExists, startMaintainer: runtime ? () => ensureMaintainer(runtime, process.argv[1]) : undefined });
  const recovery = runtime ? new OperationRecovery(runtime) : undefined;
  const recoveryTimer = recovery ? setInterval(() => recovery.tick(), 15_000) : undefined;
  recoveryTimer?.unref();
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(recoveryTimer);
    const stopped = recovery?.stop();
    await server.close();
    await stopped;
    await runtime?.drain();
    store?.close();
  };
  const shutdown = () => { void close().catch(() => { process.exitCode = 1; }); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.stdin.once("end", shutdown);
  await server.connect(new StdioServerTransport());
}
void main().catch(error => {
  const message = error instanceof TradingError ? error.message : "Unable to start or configure wallet state. Check the passphrase, state directory permissions, and installed SDK.";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});
