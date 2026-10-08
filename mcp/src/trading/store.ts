import { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from "node:crypto";
import { closeSync, chmodSync, existsSync, lstatSync, mkdirSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

// All wallet material, plans and checkpoints are encrypted before SQLite sees them.
// The passphrase comes from the terminal or the host environment, never an MCP tool.
export class TradingStore {
  private db: DatabaseSync;
  private key!: Buffer;
  private activeLocks = 0;
  private transactionContext = new AsyncLocalStorage<{ active: boolean }>();
  private closed = false;
  readonly directory: string;

  constructor(directory: string, password: string, create = false) {
    this.directory = resolve(directory);
    const path = join(this.directory, "state.sqlite");
    if (!existsSync(path) && !create) throw new Error("Setup required: run shield-swap-mcp setup in a terminal.");
    if (!password || (create && password.length < 12)) throw new Error("Unlock requires a passphrase of at least 12 characters.");
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const directoryInfo = lstatSync(this.directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error("State directory must be a real directory.");
    if (process.platform !== "win32" && (directoryInfo.mode & 0o077)) throw new Error("State directory must have mode 0700.");
    if (!existsSync(path)) closeSync(openSync(path, "wx", 0o600));
    const fileInfo = lstatSync(path);
    if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) throw new Error("State must be a regular file.");
    chmodSync(path, 0o600);
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;");
    this.db.exec("CREATE TABLE IF NOT EXISTS metadata (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, value BLOB NOT NULL);");
    try {
      this.db.exec("BEGIN IMMEDIATE");
      let salt = this.db.prepare("SELECT value FROM metadata WHERE id='salt'").get()?.value as string | undefined;
      if (!salt) {
        if (!create) throw new Error("Wallet state is not initialized.");
        salt = randomBytes(32).toString("hex");
        this.db.prepare("INSERT INTO metadata VALUES ('salt', ?)").run(salt);
      }
      this.key = scryptSync(password, Buffer.from(salt, "hex"), 32, { N: 32768, maxmem: 64 * 1024 * 1024 });
      const check = this.get<string>("system:check");
      if (check === undefined && create) this.set("system:check", "shield-swap-mcp-v1");
      else if (check !== "shield-swap-mcp-v1") throw new Error("Invalid state.");
      this.db.exec("COMMIT");
    } catch {
      this.db.exec("ROLLBACK");
      this.db.close();
      this.key!?.fill(0);
      throw new Error("Could not unlock wallet state. Check the passphrase and state directory.");
    }
  }

  get<T>(id: string): T | undefined {
    const row = this.db.prepare("SELECT value FROM documents WHERE id=?").get(id);
    if (!row) return undefined;
    const blob = Buffer.from(row.value as Uint8Array);
    const decipher = createDecipheriv("aes-256-gcm", this.key, blob.subarray(0, 12));
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(blob.subarray(12, 28));
    const value = Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(value, (_name, item) => item && typeof item === "object" && Object.keys(item).length === 1 && typeof item.$shieldBigInt === "string" ? BigInt(item.$shieldBigInt) : item) as T;
  }

  set(id: string, value: unknown): void {
    if (this.transactionContext.getStore()?.active === false) throw new Error("Storage transaction has ended.");
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    cipher.setAAD(Buffer.from(id));
    const plain = JSON.stringify(value, (_name, item) => typeof item === "bigint" ? { $shieldBigInt: String(item) } : item);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const blob = Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    this.db.prepare("INSERT INTO documents VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").run(id, blob);
  }

  list<T>(prefix: string): T[] {
    return this.db.prepare("SELECT id FROM documents WHERE substr(id, 1, ?) = ? ORDER BY id").all(prefix.length, prefix).map(row => this.get<T>(row.id as string)!);
  }

  transaction<T>(fn: () => T): T {
    if (fn.constructor.name === "AsyncFunction") throw new Error("Storage transactions must be synchronous.");
    const context = { active: true };
    this.db.exec("BEGIN IMMEDIATE");
    return this.transactionContext.run(context, () => {
      try {
        const result = fn();
        if (result && typeof (result as { then?: unknown }).then === "function") {
          // Suppress only the rejected callback's promise; escaped writes are
          // separately prevented by the inactive async context below.
          void Promise.resolve(result).catch(() => {});
          throw new Error("Storage transactions must be synchronous.");
        }
        this.db.exec("COMMIT");
        return result;
      } catch (error) { this.db.exec("ROLLBACK"); throw error; }
      finally { context.active = false; }
    });
  }

  async withLock<T>(scope: string, fn: () => Promise<T>): Promise<T> {
    // A separate SQLite file holds only an OS-backed transaction lock. It does
    // not block reads/writes to the encrypted state DB. The kernel releases it
    // on process exit, so recovery needs neither a lease timeout nor a PID.
    const locks = join(this.directory, "locks");
    mkdirSync(locks, { mode: 0o700, recursive: true });
    if (lstatSync(locks).isSymbolicLink()) throw new Error("Invalid lock directory.");
    const path = join(locks, createHash("sha256").update(scope).digest("hex") + ".sqlite");
    try { closeSync(openSync(path, "wx", 0o600)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    if (lstatSync(path).isSymbolicLink()) throw new Error("Invalid wallet lock file.");
    const lock = new DatabaseSync(path);
    try { lock.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE"); }
    catch { lock.close(); throw new Error("Wallet is busy in another operation. Retry after it finishes."); }
    this.activeLocks++;
    try { return await fn(); }
    finally { lock.exec("ROLLBACK"); lock.close(); this.activeLocks--; }
  }

  close(): void {
    if (this.closed) return;
    if (this.activeLocks) throw new Error("Cannot close state while wallet operations are active.");
    this.db.close();
    this.key.fill(0);
    this.closed = true;
  }
}
