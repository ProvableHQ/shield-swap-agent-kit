import { spawn, type ChildProcess } from "node:child_process";
import type { MaintenanceTarget } from "./types";

/** Starts and stops maintainer processes; the server records their state. */
export type MaintenanceLauncher = {
  launch(options: { profileId: string; targets: MaintenanceTarget[]; intervalSeconds: number }): { pid: number };
  stop(pid: number): void;
};

/**
 * Launches `node <entry> maintain …` as a child of this server. The child
 * watches `--parent` and exits when this process is gone, so agent-launched
 * maintenance never outlives the session that asked for it. Operators who
 * want a maintainer that survives the server run the same command themselves.
 */
export function createMaintenanceLauncher(entry: string, env: NodeJS.ProcessEnv, stateDir?: string): MaintenanceLauncher & { stopAll(): void } {
  const children = new Set<ChildProcess>();
  return {
    launch: ({ profileId, targets, intervalSeconds }) => {
      const args = [entry, "maintain", "--profile", profileId, "--interval", String(intervalSeconds), "--parent", String(process.pid),
        ...(stateDir ? ["--state-dir", stateDir] : []),
        ...targets.flatMap(target => ["--target", `${target.token}=${target.records}:${target.minRecordAmount}`])];
      // The child inherits the passphrase through the environment, never through arguments.
      const child = spawn(process.execPath, args, { env, stdio: "ignore" });
      children.add(child);
      child.once("exit", () => children.delete(child));
      if (child.pid === undefined) throw new Error("The maintainer process did not start.");
      return { pid: child.pid };
    },
    stop: pid => { try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ } },
    stopAll: () => { for (const child of children) child.kill("SIGTERM"); },
  };
}
