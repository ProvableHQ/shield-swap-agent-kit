import { existsSync } from "node:fs";
import { join } from "node:path";
import { argumentsFor, configure, help, setup, stateDirectory } from "./terminal";
import { InventoryMaintenance } from "./trading/maintenance";
import { OperationRecovery } from "./trading/recovery";
import { MaintainerProcess, maintenanceMode, maintainerShutdown } from "./trading/maintenance-process";
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
  const mode = command === "serve" ? maintenanceMode(values["maintenance-mode"] ?? process.env.SHIELD_SWAP_MCP_MAINTENANCE_MODE) : undefined;
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
    const shutdown = maintainerShutdown(values["parent-attached"] === true);
    const ready = () => { if (process.connected) process.send?.({ ready: true }, () => {}); };
    try {
      if (!shutdown.signal.aborted) await new InventoryMaintenance(runtime).run(shutdown.signal, ready);
    } catch (error) {
      if (error instanceof LockBusyError && process.send) ready();
      else throw error;
    } finally {
      try { await runtime.drain(); store.close(); }
      finally { shutdown.dispose(); }
    }
    return;
  }
  const maintainer = runtime ? new MaintainerProcess(runtime, process.argv[1], mode) : undefined;
  const server = createTradingServer(runtime, { stateExists, startMaintainer: maintainer ? () => maintainer.start() : undefined });
  const recovery = runtime ? new OperationRecovery(runtime) : undefined;
  const recoveryTimer = recovery ? setInterval(() => recovery.tick(), 15_000) : undefined;
  recoveryTimer?.unref();
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(recoveryTimer);
    const stopped = recovery?.stop();
    const workerStopped = maintainer?.stop();
    await server.close();
    await Promise.all([stopped, workerStopped]);
    await runtime?.drain();
    store?.close();
  };
  const shutdown = () => { void close().catch(() => { process.exitCode = 1; }); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.once("SIGHUP", shutdown);
  process.stdin.once("end", shutdown);
  await server.connect(new StdioServerTransport());
}
void main().catch(error => {
  const message = error instanceof TradingError ? error.message : "Unable to start or configure wallet state. Check the passphrase, state directory permissions, and installed SDK.";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});
