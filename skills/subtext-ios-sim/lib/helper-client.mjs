import { execFile, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { SimError } from './errors.mjs';

const HELPER_BUILD = join(dirname(fileURLToPath(import.meta.url)), '..', 'helper', 'build.sh');

/** Runs helper/build.sh (a no-op when already built) and returns the binary path. */
export function buildHelper() {
  return new Promise((resolve, reject) => {
    execFile('bash', [HELPER_BUILD], { timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const tail = String(stderr).trim().split('\n').at(-1);
        reject(new SimError('helper_build_failed', `simulator helper build failed: ${tail}`, 'run `subtext-sim doctor` for details'));
      } else resolve(String(stdout).trim().split('\n').at(-1));
    });
  });
}

/**
 * A long-lived helper process speaking JSON lines. If the process dies, pending
 * requests fail with `helper_crashed` and the next request starts a fresh one.
 */
export class HelperClient {
  constructor(command, args = [], { log = () => {}, timeoutMs = 30_000 } = {}) {
    this.command = command;
    this.args = args;
    this.log = log;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.proc = null;
    this.restarts = 0;
    this.closed = false;
  }

  get alive() {
    return !!this.proc;
  }

  start() {
    if (this.proc || this.closed) return;
    const proc = spawn(this.command, this.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = proc;
    createInterface({ input: proc.stdout }).on('line', (line) => this.onLine(line));
    const verbose = !!process.env.SUBTEXT_SIM_DEBUG;
    createInterface({ input: proc.stderr }).on('line', (line) => {
      if (verbose || /fail|error/i.test(line)) this.log(`helper: ${line}`);
    });
    proc.on('error', (err) => this.onExit(`failed to start: ${err.message}`));
    proc.on('exit', (code, signal) => this.onExit(`exited (${signal ?? code})`));
    proc.stdin.on('error', () => {});
  }

  onExit(reason) {
    if (!this.proc) return;
    this.proc = null;
    if (!this.closed) {
      this.restarts++;
      this.log(`helper ${reason}; restarting on next request`);
    }
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new SimError('helper_crashed', `simulator helper ${reason}`));
    }
    this.pending.clear();
  }

  onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      this.log(`helper: unparseable line ${line.slice(0, 200)}`);
      return;
    }
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    clearTimeout(entry.timer);
    if (msg.ok) entry.resolve(msg.result ?? {});
    else entry.reject(new SimError(msg.error?.code ?? 'internal', msg.error?.message ?? 'helper error'));
  }

  request(cmd, args = {}, { timeoutMs = this.timeoutMs } = {}) {
    if (this.closed) return Promise.reject(new SimError('helper_closed', 'the helper is shut down'));
    this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new SimError('helper_timeout', `helper ${cmd} timed out after ${timeoutMs} ms`, 'retry; if it keeps timing out, run `subtext-sim stop` then `subtext-sim start`'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(`${JSON.stringify({ id, cmd, args })}\n`);
    });
  }

  close() {
    this.closed = true;
    const proc = this.proc;
    this.onExit('closed');
    if (proc) {
      proc.stdin.end();
      proc.kill();
    }
  }
}
