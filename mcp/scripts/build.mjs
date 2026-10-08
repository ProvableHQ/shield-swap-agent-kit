import { build } from "esbuild";
import { chmod } from "node:fs/promises";
await build({
  entryPoints: ["src/cli.ts", "src/claude-launch.ts", "src/claude-proxy.ts"], outdir: "dist", bundle: true,
  platform: "node", format: "esm", target: "node22", packages: "external",
  banner: { js: "#!/usr/bin/env node" }, sourcemap: true,
});
await chmod("dist/cli.js", 0o755);
await chmod("dist/claude-launch.js", 0o755);
await chmod("dist/claude-proxy.js", 0o755);
