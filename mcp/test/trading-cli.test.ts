import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
const run = promisify(execFile);
test("terminal setup help documents external keys without needing a configured wallet", async () => {
  const result = await run(process.execPath, ["--import", "tsx", resolve("src/cli.ts"), "--help"], { timeout: 10000 });
  assert.match(result.stdout, /setup/);
  assert.match(result.stdout, /key-env/);
  assert.match(result.stdout, /serve/);
});
test("raw private keys are rejected as command arguments and never echoed", async () => {
  try {
    await run(process.execPath, ["--import", "tsx", resolve("src/cli.ts"), "setup", "--private-key", "NEVER-ECHO-THIS-KEY"], { timeout: 10000 });
    assert.fail("expected rejection");
  } catch (error) {
    const result = error as { code: number; stdout: string; stderr: string };
    assert.equal(result.code, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /NEVER-ECHO-THIS-KEY/);
    assert.match(result.stderr, /arguments/i);
  }
});
