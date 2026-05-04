/**
 * Regression test for the "orphaned tunnel pegged at 100% CPU" bug.
 *
 * Symptom: when the MCP host process (Claude Code) dies, the tunnel client
 * is reparented to PID 1 and its stdio pipes are closed at the parent end.
 * Any further log call writes to a closed pipe -> EPIPE -> uncaughtException
 * -> log() -> EPIPE -> ... infinite loop, CPU pegged, process never exits.
 *
 * The fix lives in src/main.ts:
 *   1. log() catches its own failures so it cannot throw.
 *   2. process.stderr 'error' handler exits(0) on EPIPE.
 *   3. Periodic PPID==1 check exits(0) when reparented to init.
 *
 * Each test below exercises one of those layers end-to-end against the
 * actual built binary so we'd catch a regression in any layer.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// tests run from build/tests/, so ../src/ resolves to build/src/.
const BIN = path.resolve(__dirname, '..', 'src', 'index.js');

/** Wait for stderr to contain `marker`, throwing on timeout. */
function waitForStderr(
  child: ChildProcessWithoutNullStreams,
  marker: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => {
      reject(new Error(`stderr never contained ${JSON.stringify(marker)} within ${timeoutMs}ms (got: ${JSON.stringify(buf)})`));
    }, timeoutMs);
    child.stderr.on('data', d => {
      buf += d.toString();
      if (buf.includes(marker)) {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

/** Wait for the child to exit, returning its exit code (or null on signal). */
function waitForExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<{code: number | null; signal: NodeJS.Signals | null}> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`child did not exit within ${timeoutMs}ms — likely spinning`)), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(t);
      resolve({code, signal});
    });
  });
}

describe('orphan-spin protection (main.ts)', () => {
  it('exits when stderr is closed and a log fires (EPIPE handler)', async () => {
    const child = spawn('node', [BIN], {
      stdio: ['pipe', 'pipe', 'pipe'],
      // Disable the periodic check so we know the EPIPE handler is doing the work.
      env: {...process.env, SUBTEXT_TUNNEL_ORPHAN_CHECK_MS: '3600000'},
    });

    try {
      // Wait for the startup log so we know the process is past initialization.
      await waitForStderr(child, 'MCP server started', 5000);

      // Simulate the parent closing its end of stderr/stdout. Future writes
      // from the child to its stderr/stdout will fail with EPIPE.
      child.stderr.destroy();
      child.stdout.destroy();

      // Trigger a log: closing stdin makes the MCP stdio transport see EOF
      // and shut down, which causes the tunnel server to log on its way out.
      // The first such log will hit the broken stderr.
      child.stdin.end();

      const {code, signal} = await waitForExit(child, 5000);
      // We accept any clean exit: the EPIPE path uses exit(0); a crash from
      // pre-fix behavior would either hang (caught by waitForExit) or die
      // with a different signal we'd want to know about.
      assert.equal(signal, null, `expected clean exit, got signal ${signal}`);
      assert.ok(code === 0 || code === 1, `unexpected exit code ${code}`);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });

  it('exits when reparented to PID 1 (orphan PPID check)', async () => {
    // Spawn a parent script that itself spawns the tunnel as a detached
    // grandchild, prints the grandchild PID, then exits. The grandchild is
    // then orphaned (PPID becomes 1) and our periodic check should notice
    // and exit it.
    const grandparentScript = `
      const {spawn} = require('node:child_process');
      const child = spawn('node', [${JSON.stringify(BIN)}], {
        stdio: 'inherit',
        detached: true,
        env: Object.assign({}, process.env, {SUBTEXT_TUNNEL_ORPHAN_CHECK_MS: '200'}),
      });
      child.unref();
      process.stdout.write(String(child.pid) + '\\n');
      process.exit(0);
    `;

    const parent = spawn('node', ['-e', grandparentScript], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    let pidStr = '';
    parent.stdout!.on('data', d => { pidStr += d.toString(); });

    const parentExit = await new Promise<number | null>(r =>
      parent.once('exit', code => r(code)),
    );
    assert.equal(parentExit, 0, 'parent script should exit cleanly');

    const grandchildPid = parseInt(pidStr.trim(), 10);
    assert.ok(Number.isFinite(grandchildPid) && grandchildPid > 1, `expected a real PID, got ${pidStr}`);

    // Wait up to 5s for the grandchild to notice it's orphaned and exit.
    // The interval is 200ms in the test env, so 5s is generous.
    const start = Date.now();
    while (Date.now() - start < 5000) {
      try {
        process.kill(grandchildPid, 0); // signal 0 = existence check
        await new Promise(r => setTimeout(r, 100));
      } catch {
        return; // ESRCH — process is gone, success.
      }
    }

    // Cleanup if still alive — and fail.
    try { process.kill(grandchildPid, 'SIGKILL'); } catch { /* already gone */ }
    assert.fail(`grandchild PID ${grandchildPid} did not exit within 5s after orphaning`);
  });

  it('safe log does not throw when stderr is broken', async () => {
    // Smoke test of the inner safety: if log() can't even write the EPIPE
    // because stderr is fully gone, it must not throw and recurse. We model
    // this by confirming the *process* survives a forced log on broken
    // stderr long enough for either guard (try/catch in log, EPIPE handler)
    // to take effect, rather than crashing on uncaught EPIPE.
    const child = spawn('node', [BIN], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {...process.env, SUBTEXT_TUNNEL_ORPHAN_CHECK_MS: '3600000'},
    });

    try {
      await waitForStderr(child, 'MCP server started', 5000);
      child.stderr.destroy();
      // Don't end stdin yet — we just want to see that the process doesn't
      // immediately crash with an unhandled EPIPE just because stderr
      // *might* be written to. Wait briefly to confirm stable state.
      await new Promise(r => setTimeout(r, 250));
      assert.equal(child.exitCode, null, 'process should not exit before any log fires');

      // Now trigger a log via stdin EOF -> shutdown path.
      child.stdin.end();
      const {signal} = await waitForExit(child, 5000);
      assert.equal(signal, null, 'expected clean exit, not a signal');
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  });
});
