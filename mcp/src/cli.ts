import { existsSync } from "node:fs";
import { join } from "node:path";
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
  const [{ StdioServerTransport }, { createTradingServer }, { TradingStore }, { TradingRuntime }, { VeilBackend }] = await Promise.all([
    import("@modelcontextprotocol/sdk/server/stdio.js"), import("./trading/server"),
    import("./trading/store"), import("./trading/runtime"), import("./trading/veil"),
  ]);
  const directory = stateDirectory(values);
  const passphrase = process.env.SHIELD_SWAP_MCP_PASSWORD;
  const stateExists = existsSync(join(directory, "state.sqlite"));
  const store = passphrase && stateExists ? new TradingStore(directory, passphrase) : undefined;
  const runtime = store ? new TradingRuntime(store, new VeilBackend(store)) : undefined;
  const server = createTradingServer(runtime, { stateExists });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
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
void main().catch(error => {
  const message = error instanceof TradingError ? error.message : "Unable to start or configure wallet state. Check the passphrase, state directory permissions, and installed SDK.";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});
