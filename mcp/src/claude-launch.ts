import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { hiddenInput, password, setup, stateDirectory } from "./terminal";
import { TradingStore } from "./trading/store";
import { TradingError, type Profile, type SecretRef } from "./trading/types";
import { startBroker } from "./claude-broker";
import { renderWelcome } from "../../tools/welcome.mjs";

for (const method of ["log", "info", "warn", "error", "debug", "dir", "table", "trace"] as const) console[method] = () => {};

export function secretReferences(profile: Profile): string[] {
  const refs: SecretRef[] = [profile.key];
  for (const wallet of [profile.evm, profile.solana]) {
    if (!wallet) continue;
    for (const value of Object.values(wallet)) {
      if (value && typeof value === "object" && "type" in value) refs.push(value as SecretRef);
    }
  }
  return [...new Set(refs.filter(ref => ref.type === "env").map(ref => {
    const name = (ref as { name: string }).name;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new TradingError("invalid_key_env", "A configured credential reference is invalid.");
    return name;
  }))];
}

export function claudeEnvironment(environment: NodeJS.ProcessEnv, refs: string[]): NodeJS.ProcessEnv {
  // Only terminal settings cross into Claude. Use its existing interactive
  // login; wallet and provider credentials remain in the MCP environment.
  const allowed = /^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TEMP|TMP|TERM|COLORTERM|TERM_PROGRAM|TERM_PROGRAM_VERSION|LANG|LC_.*)$/;
  const result = Object.fromEntries(Object.entries(environment).filter(([name]) => allowed.test(name)));
  delete result.SHIELD_SWAP_MCP_PASSWORD;
  for (const name of refs) delete result[name];
  return result;
}

export function claudeMcpConfiguration(proxy: string, endpoint: string) {
  return { mcpServers: { "shield-swap": { type: "stdio", command: process.execPath, args: [proxy, endpoint] } } };
}

async function runClaude(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit", shell: false });
    // Both processes share the foreground group: let Claude handle Ctrl-C and
    // wait for its exit so the broker and temporary configuration are cleaned up.
    const interrupt = () => {};
    const terminate = () => child.kill("SIGTERM");
    process.on("SIGINT", interrupt); process.on("SIGTERM", terminate);
    const cleanup = () => { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); };
    child.once("error", () => { cleanup(); reject(new TradingError("claude_unavailable", "Could not start Claude Code. Install or authenticate Claude Code, then rerun the launcher.")); });
    child.once("exit", (code, signal) => { cleanup(); done(code ?? (signal ? 130 : 1)); });
  });
}

export async function launchClaude(argv = process.argv.slice(2)): Promise<number> {
  let options;
  try {
    options = parseArgs({ args: argv, strict: true, options: {
      help: { type: "boolean", short: "h" }, project: { type: "string" }, "state-dir": { type: "string" },
      profile: { type: "string" }, network: { type: "string" }, "key-env": { type: "string" }, generate: { type: "boolean" },
    } }).values;
  } catch { throw new TradingError("invalid_arguments", "Invalid launcher arguments. Use --help; never pass keys or passphrases as arguments."); }
  if (options.help) {
    process.stdout.write("Shield Swap for Claude Code\nRun from your trading project, or use --project PATH.\nOptions: --state-dir PATH, --profile NAME, --network mainnet|testnet, --key-env NAME, --generate\nLocal account prompts run before Claude starts. Existing profiles are reused.\n");
    return 0;
  }
  if (process.platform === "win32") throw new TradingError("unsupported_platform", "The one-command launcher currently supports macOS and Linux local sockets.");
  const kit = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  if (!existsSync(join(kit, "SKILL.md"))) throw new TradingError("kit_missing", "Run the launcher from the complete Shield Swap AgentKit checkout.");
  const insideKit = (path: string) => { const part = relative(kit, path); return part === "" || (!part.startsWith("..") && !isAbsolute(part)); };
  const project = resolve(options.project ?? (insideKit(process.cwd()) ? join(homedir(), "shield-swap-trading") : process.cwd()));
  if (insideKit(project)) throw new TradingError("invalid_project", "Choose a trading project outside the AgentKit checkout.");
  await mkdir(project, { recursive: true });
  const directory = stateDirectory(options);
  let sessionDirectory: string | undefined;
  let stopBroker: (() => Promise<void>) | undefined;
  try {
    process.stderr.write(renderWelcome({ checks: {
      tools: { status: "preparing" }, account: { status: existsSync(join(directory, "state.sqlite")) ? "locked" : "missing" }, funding: { status: "not_checked" },
    } }, { width: process.stderr.columns ?? 100 }) + "\n\n");
    const passphrase = await password(directory);
    const configured = await setup({ ...options, guided: true }, passphrase);
    const mcpEnv: NodeJS.ProcessEnv = { ...process.env, SHIELD_SWAP_MCP_PASSWORD: passphrase };
    const store = new TradingStore(directory, passphrase);
    let profile: Profile;
    let key: string | undefined;
    try {
      profile = store.get<Profile>("profile:" + String(configured.profileId))!;
      if (profile.key.type === "env") {
        if (!mcpEnv[profile.key.name]) mcpEnv[profile.key.name] = await hiddenInput("Existing Aleo account key (hidden): ");
        key = mcpEnv[profile.key.name];
      } else key = store.get<string>("secret:" + profile.key.id);
      const { loadNetwork } = await import("@provablehq/veil-aleo-sdk");
      const sdk = await loadNetwork(profile.network);
      try {
        if (!key || sdk.privateKeyToAccount(key).address !== profile.address) throw new Error();
      } catch { throw new TradingError("invalid_key", "The supplied key does not match the selected Aleo account. Its configuration was preserved."); }
    } finally { store.close(); }
    const refs = secretReferences(profile);
    const claudeEnv = claudeEnvironment(process.env, refs);
    sessionDirectory = await mkdtemp(join(tmpdir(), "ss-"));
    await chmod(sessionDirectory, 0o700);
    const endpoint = join(sessionDirectory, "m");
    const dist = dirname(fileURLToPath(import.meta.url));
    stopBroker = await startBroker(endpoint, join(dist, "cli.js"), directory, mcpEnv);
    const proxy = join(dist, "claude-proxy.js");
    const client = new Client({ name: "shield-swap-launcher", version: "1" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [proxy, endpoint], env: Object.fromEntries(Object.entries(claudeEnv).filter((pair): pair is [string, string] => pair[1] !== undefined)), stderr: "pipe" });
    transport.stderr?.on("data", () => {});
    try {
      await client.connect(transport);
      const result = await client.callTool({ name: "setup", arguments: { profileId: profile.id } });
      if (result.isError) throw new Error();
      const report = result.structuredContent as { checks?: { account?: { status?: string; address?: string } } };
      if (report.checks?.account?.status !== "configured" || report.checks.account.address !== profile.address) throw new Error();
    } catch { throw new TradingError("mcp_unavailable", "Shield Swap MCP did not pass its local connection check. No funds were moved. Check the build and account configuration, then rerun the launcher."); }
    finally { await client.close(); }
    const config = join(sessionDirectory, "mcp.json");
    await writeFile(config, JSON.stringify(claudeMcpConfiguration(proxy, endpoint)), { mode: 0o600 });
    process.stderr.write("Account configured. Starting Claude with Shield Swap connected.\n\n");
    const prompt = `Read ${JSON.stringify(join(kit, "SKILL.md"))} and follow its onboarding. Use the Shield Swap MCP connection and profile ${JSON.stringify(profile.id)} throughout this session. Account setup has completed locally. Begin by calling setup for that profile and showing its welcome text, including the Shield Swap heading and Private asset trading tagline. Ask which journey I want; check current funding when relevant. Never infer funds from old session notes.`;
    return await runClaude(process.env.SHIELD_SWAP_CLAUDE_COMMAND ?? "claude", ["--mcp-config", config, "--add-dir", kit, "--", prompt], project, claudeEnv);
  } finally {
    if (stopBroker) await stopBroker();
    if (sessionDirectory) await rm(sessionDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void launchClaude().then(code => { process.exitCode = code; }).catch(error => {
    process.stderr.write((error instanceof TradingError ? error.message : "Unable to launch Shield Swap. Check the local account passphrase and installation.") + "\n");
    process.exitCode = 1;
  });
}
