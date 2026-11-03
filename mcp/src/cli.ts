import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { argumentsFor, configure, help, setup, stateDirectory } from "./terminal";
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
  if (command === "maintain") { await maintain(values); return; }
  const [{ StdioServerTransport }, { createTradingServer }, { TradingStore }, { TradingRuntime }, { VeilBackend }] = await Promise.all([
    import("@modelcontextprotocol/sdk/server/stdio.js"), import("./trading/server"),
    import("./trading/store"), import("./trading/runtime"), import("./trading/veil"),
  ]);
  const directory = stateDirectory(values);
  const passphrase = process.env.SHIELD_SWAP_MCP_PASSWORD;
  const stateExists = existsSync(join(directory, "state.sqlite"));
  const store = passphrase && stateExists ? new TradingStore(directory, passphrase) : undefined;
  const runtime = store ? new TradingRuntime(store, new VeilBackend(store)) : undefined;
  const { createMaintenanceLauncher } = await import("./trading/maintenance-launcher");
  const launcher = createMaintenanceLauncher(fileURLToPath(import.meta.url), process.env, values["state-dir"]);
  const server = createTradingServer(runtime, { stateExists, launcher });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    launcher.stopAll();
    await server.close();
    await runtime?.drain();
    store?.close();
  };
  const shutdown = () => { void close().catch(() => { process.exitCode = 1; }); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  process.stdin.once("end", shutdown);
  await server.connect(new StdioServerTransport());
}
async function maintain(values: Record<string, unknown>): Promise<void> {
  const [{ TradingStore }, { TradingRuntime }, { VeilBackend }, { Maintainer }] = await Promise.all([
    import("./trading/store"), import("./trading/runtime"), import("./trading/veil"), import("./trading/maintainer"),
  ]);
  const directory = stateDirectory(values);
  const passphrase = process.env.SHIELD_SWAP_MCP_PASSWORD;
  if (!passphrase || !existsSync(join(directory, "state.sqlite"))) throw new TradingError("setup_required", "Run terminal setup first and supply SHIELD_SWAP_MCP_PASSWORD.");
  const interval = values.interval === undefined ? 120 : Number(values.interval);
  if (!Number.isInteger(interval) || interval < 30 || interval > 3600) throw new TradingError("invalid_arguments", "--interval must be a whole number of seconds from 30 to 3600.");
  const parent = values.parent === undefined ? undefined : Number(values.parent);
  const targets = ((values.target as string[] | undefined) ?? []).map(Maintainer.parseTarget);
  const store = new TradingStore(directory, passphrase);
  const runtime = new TradingRuntime(store, new VeilBackend(store));
  const profileId = String(values.profile ?? store.get<{ defaultProfile?: string }>("settings")?.defaultProfile ?? "default");
  const maintainer = new Maintainer(runtime, profileId, targets, { intervalSeconds: interval });
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => controller.abort());
  // A server-launched maintainer dies with the server: once the parent is
  // gone, the kernel reparents this process and ppid changes.
  const watch = parent === undefined ? undefined : setInterval(() => { if (process.ppid !== parent) controller.abort(); }, 5_000);
  try {
    if (values.once) {
      await maintainer.start();
      const pass = await maintainer.runPass();
      await maintainer.stop();
      process.stdout.write(JSON.stringify({ profileId, pass }) + "\n");
    } else {
      await maintainer.run(controller.signal);
    }
  } finally {
    if (watch) clearInterval(watch);
    await runtime.drain();
    store.close();
  }
}
void main().catch(error => {
  const message = error instanceof TradingError ? error.message : "Unable to start or configure wallet state. Check the passphrase, state directory permissions, and installed SDK.";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});
