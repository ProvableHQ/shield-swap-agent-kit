import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Socket } from "node:net";
import { chmod } from "node:fs/promises";

/** One fresh stdio MCP child per Claude connection/reconnection. */
export async function startBroker(endpoint: string, entry: string, directory: string, mcpEnv: NodeJS.ProcessEnv) {
  const children = new Set<ChildProcessWithoutNullStreams>();
  const sockets = new Set<Socket>();
  const server = createServer({ allowHalfOpen: true }, socket => {
    sockets.add(socket);
    const child = spawn(process.execPath, [entry, "serve", "--state-dir", directory], { env: mcpEnv, stdio: "pipe", shell: false });
    children.add(child);
    socket.pipe(child.stdin);
    child.stdout.pipe(socket);
    child.stderr.on("data", () => {}); // SDK diagnostics may contain credentials.
    child.stdin.on("error", () => {}); // A closed connection must not crash the broker.
    child.once("error", () => socket.destroy());
    child.once("close", () => { children.delete(child); socket.end(); });
    socket.on("error", () => socket.destroy());
    socket.once("close", () => { sockets.delete(socket); socket.unpipe(child.stdin); child.stdin.end(); });
  });
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(endpoint, () => { server.off("error", reject); done(); }); });
  await chmod(endpoint, 0o600);
  return async () => {
    const stopped = new Promise<void>(done => server.close(() => done()));
    for (const socket of sockets) socket.destroy();
    for (const child of children) { child.stdin.end(); child.kill("SIGTERM"); }
    // Interrupted operations retain their original durable recovery state.
    // Bound shutdown so a hung prover cannot keep the launcher alive forever.
    const remaining = [...children];
    const forced = setTimeout(() => { for (const child of children) child.kill("SIGKILL"); }, 5000);
    try { await Promise.all([stopped, ...remaining.map(child => new Promise<void>(done => child.once("close", () => done())))]); }
    finally { clearTimeout(forced); }
  };
}
