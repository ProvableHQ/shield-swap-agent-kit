import { connect } from "node:net";

// Claude gets only this stdio connection. Wallet credentials stay in the
// launcher's MCP child; nothing on this channel exports an environment.
const endpoint = process.argv[2];
if (!endpoint) { process.stderr.write("Shield Swap connection is missing. Rerun its launcher.\n"); process.exitCode = 1; }
else {
  const socket = connect({ path: endpoint, allowHalfOpen: true });
  socket.once("connect", () => { process.stdin.pipe(socket); socket.pipe(process.stdout); });
  socket.once("error", () => { process.stderr.write("Shield Swap connection ended. Rerun its launcher.\n"); process.exitCode = 1; });
  socket.once("close", () => { process.stdin.unpipe(socket); process.stdin.pause(); });
  process.once("SIGTERM", () => socket.destroy());
  process.once("SIGINT", () => socket.destroy());
}
