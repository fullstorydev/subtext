import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { SimError, fromWire } from './errors.mjs';
import { SESSION_FILE } from './daemon.mjs';

/** The nearest `.sightmap/` at or above `cwd`, else `<cwd>/.sightmap` (created by `start`). */
export function findSightmapDir(cwd = process.cwd(), explicit) {
  if (explicit) return resolve(cwd, explicit);
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.sightmap'))) return join(dir, '.sightmap');
    if (dirname(dir) === dir) return join(resolve(cwd), '.sightmap');
  }
}

export function readSession(sightmapDir) {
  const file = join(sightmapDir, SESSION_FILE);
  if (!existsSync(file)) return null;
  try {
    return { ...JSON.parse(readFileSync(file, 'utf8')), file };
  } catch {
    return null;
  }
}

export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

export function call(socketPath, cmd, args = {}, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const socket = createConnection(socketPath);
    let data = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new SimError('daemon_timeout', `the daemon did not answer ${cmd} within ${Math.round(timeoutMs / 1000)} s`, 'check `subtext-sim status`; if it is stuck, `subtext-sim stop` then `subtext-sim start --detach`'));
    }, timeoutMs);
    socket.on('connect', () => socket.write(`${JSON.stringify({ id: 1, cmd, args })}\n`));
    socket.on('data', (chunk) => { data += chunk; });
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(new SimError('daemon_unreachable', `cannot reach the subtext-sim daemon at ${socketPath} (${err.code ?? err.message})`));
    });
    socket.on('end', () => {
      clearTimeout(timer);
      let msg;
      try {
        msg = JSON.parse(data.trim().split('\n')[0]);
      } catch {
        reject(new SimError('daemon_unreachable', 'the daemon closed the connection without answering'));
        return;
      }
      if (msg.ok) resolvePromise(msg.result);
      else reject(fromWire(msg.error));
    });
  });
}

/** The live session for `sightmapDir`; removes a stale session file whose daemon is gone. */
export async function liveSession(sightmapDir) {
  const session = readSession(sightmapDir);
  if (!session) return null;
  if (pidAlive(session.pid)) {
    try {
      await call(session.socket, 'ping', {}, { timeoutMs: 5000 });
      return session;
    } catch {
      // A live pid that does not answer is treated as stale; fall through.
    }
  }
  rmSync(session.file, { force: true });
  return null;
}

export async function requireSession(sightmapDir) {
  const session = await liveSession(sightmapDir);
  if (!session) throw new SimError('no_session', `no running subtext-sim session (no live ${join(sightmapDir, SESSION_FILE)})`);
  return session;
}
