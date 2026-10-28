import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimError, toWire } from './errors.mjs';
import { call, findSightmapDir, liveSession, pidAlive, readSession, requireSession } from './client.mjs';
import { runDaemon, SESSION_FILE } from './daemon.mjs';
import { CACHE_ROOT } from './sightmap-cli.mjs';
import { buildHelper } from './helper-client.mjs';
import * as simctl from './simctl.mjs';
import { latestRunPath, readRun, RUNS_DIR } from './runlog.mjs';

const BIN = fileURLToPath(new URL('../bin/subtext-sim', import.meta.url));

const BOOLEAN_FLAGS = new Set(['detach', 'json', 'include-offscreen', 'clear', 'help', 'shutdown', 'fix', 'follow', 'all']);
const VALUE_FLAGS = new Set(['device', 'app', 'bundle-id', 'view', 'out', 'tree-out', 'in', 'until', 'max', 'limit', 'grep', 'level', 'duration', 'sightmap-dir', 'label', 'since', 'run']);

export const USAGE = `subtext-sim: drive an app in the local iOS Simulator (sightmap-browser style)

Session
  doctor [--fix]                                   check prerequisites; builds the helper
  start [--device NAME|UDID] [--app PATH] [--bundle-id ID] [--detach] [--label L]
                                                   boot, enable accessibility, install, launch, run the daemon;
                                                   on a running session: reinstall (--app) and relaunch the same app
  status                                           session health
  stop [--shutdown]                                stop the daemon and the app (--shutdown: the simulator too)
  launch | relaunch                                foreground the app | restart it (re-enables accessibility)

Observe
  snapshot [--view V] [--include-offscreen] [--out F] [--tree-out F] [--json]
  screenshot --out F.png
  console list [--limit N] [--grep S] [--level L[,L]] [--all]   levels: debug info default error fault stdout stderr; --all includes Apple frameworks
  console get <index>
  session-url                                      Fullstory session URL from the app's logs

Run log (.sightmap/.sim-runs/<run>.jsonl: one line per action, for a consumer agent)
  run new [--label L]                              start a new run (start also begins one)
  run current                                      the current run's id and path
  run tail [--follow] [--since SEQ] [--run ID]     print run entries; --follow keeps streaming

Act (targets: snapshot id, accessibility identifier, or component query)
  click <target>
  fill <target> <text> [--clear]
  scroll <up|down|left|right> [--in <target>] [--until <target>] [--max N]
  swipe <x1> <y1> <x2> <y2> [--duration S]       screen points (not pixels), origin top-left
  tap-xy <x> <y>                                   screen points (not pixels); off-screen points are refused
  type <text>
  key <name>                                       return delete tab escape space up down left right …
  button <name>                                    home lock siri side apple_pay volume_up volume_down
  openurl <url>

Global: --json (machine-readable output), --sightmap-dir DIR (default: nearest .sightmap/)`;

export function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  let i = 0;
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--') && arg.length > 2) {
      const eq = arg.indexOf('=');
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (BOOLEAN_FLAGS.has(name)) {
        if (eq !== -1) throw new SimError('usage', `--${name} takes no value`);
        flags[name] = true;
      } else if (VALUE_FLAGS.has(name)) {
        const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
        if (value === undefined) throw new SimError('usage', `--${name} needs a value`);
        flags[name] = value;
      } else {
        throw new SimError('usage', `unknown flag --${name}`);
      }
    } else if (arg === '-h') {
      flags.help = true;
    } else {
      positionals.push(arg);
    }
  }
  const [command = 'help', ...rest] = positionals;
  return { command, positionals: rest, flags };
}

const num = (value, name) => {
  const n = Number(value);
  if (value === undefined || value === '' || !Number.isFinite(n)) throw new SimError('usage', `${name} must be a number, got ${JSON.stringify(value)}`);
  return n;
};

const need = (positionals, count, usage) => {
  if (positionals.length < count) throw new SimError('usage', `usage: subtext-sim ${usage}`);
};

/**
 * Maps a parsed command line to a daemon request `{cmd, args}`, or null for
 * commands the CLI handles itself (help, doctor, start, stop, status).
 */
export function toRequest({ command, positionals: p, flags }, cwd = process.cwd()) {
  const abs = (f) => (f ? resolve(cwd, f) : undefined);
  switch (command) {
    case 'snapshot':
      return { cmd: 'snapshot', args: { view: flags.view, includeOffscreen: !!flags['include-offscreen'], out: abs(flags.out), treeOut: abs(flags['tree-out']), json: !!flags.json } };
    case 'click':
      need(p, 1, 'click <target>');
      return { cmd: 'click', args: { target: p[0] } };
    case 'fill':
      need(p, 2, 'fill <target> <text> [--clear]');
      return { cmd: 'fill', args: { target: p[0], text: p[1], clear: !!flags.clear } };
    case 'scroll':
      need(p, 1, 'scroll <up|down|left|right> [--in <target>] [--until <target>]');
      if (!['up', 'down', 'left', 'right'].includes(p[0])) throw new SimError('usage', `scroll direction must be up, down, left or right, not ${JSON.stringify(p[0])}`);
      return { cmd: 'scroll', args: { direction: p[0], within: flags.in, until: flags.until, ...(flags.max ? { max: num(flags.max, '--max') } : {}) } };
    case 'swipe':
      need(p, 4, 'swipe <x1> <y1> <x2> <y2> [--duration S]');
      return { cmd: 'swipe', args: { x1: num(p[0], 'x1'), y1: num(p[1], 'y1'), x2: num(p[2], 'x2'), y2: num(p[3], 'y2'), ...(flags.duration ? { duration: num(flags.duration, '--duration') } : {}) } };
    case 'tap-xy':
      need(p, 2, 'tap-xy <x> <y>  (screen points, not pixels)');
      return { cmd: 'tapXY', args: { x: num(p[0], 'x'), y: num(p[1], 'y') } };
    case 'type':
      need(p, 1, 'type <text>');
      return { cmd: 'type', args: { text: p[0] } };
    case 'key':
      need(p, 1, 'key <name>');
      return { cmd: 'key', args: { key: p[0] } };
    case 'button':
      need(p, 1, 'button <name>');
      return { cmd: 'button', args: { name: p[0] } };
    case 'openurl':
      need(p, 1, 'openurl <url>');
      return { cmd: 'openurl', args: { url: p[0] } };
    case 'screenshot':
      if (!flags.out) throw new SimError('usage', 'usage: subtext-sim screenshot --out F.png');
      return { cmd: 'screenshot', args: { out: abs(flags.out) } };
    case 'launch':
      return { cmd: 'launch', args: {} };
    case 'relaunch':
      return { cmd: 'relaunch', args: {} };
    case 'session-url':
      return { cmd: 'sessionUrl', args: {} };
    case 'console': {
      const [sub, index] = p;
      if (sub === 'list') return { cmd: 'consoleList', args: { limit: flags.limit ? num(flags.limit, '--limit') : 50, grep: flags.grep, level: flags.level, all: !!flags.all } };
      if (sub === 'get') {
        need(p, 2, 'console get <index>');
        return { cmd: 'consoleGet', args: { index: num(index, 'index') } };
      }
      throw new SimError('usage', 'usage: subtext-sim console list [--limit N] [--grep S] [--level L] | console get <index>');
    }
    case 'run': {
      const [sub] = p;
      if (sub === 'new') return { cmd: 'runNew', args: { label: flags.label } };
      if (sub === 'current') return { cmd: 'runCurrent', args: {} };
      if (sub === 'tail') return null;
      throw new SimError('usage', 'usage: subtext-sim run new [--label L] | run current | run tail [--follow] [--since SEQ]');
    }
    case 'help': case 'doctor': case 'start': case 'stop': case 'status':
      return null;
    default:
      throw new SimError('usage', `unknown command ${JSON.stringify(command)}`);
  }
}

const consoleLine = (e) => {
  const where = e.subsystem ? ` ${e.subsystem}${e.category ? `:${e.category}` : ''}` : '';
  return `#${e.index} [--] ${e.level.padEnd(7)}${where}  ${e.message.split('\n')[0]}`;
};

/** Human output for each daemon command, in the shape of `sightmap browser`. */
export function formatResult(cmd, r) {
  switch (cmd) {
    case 'snapshot': return r.text;
    case 'click': return `✓ clicked ${r.target} at (${r.x}, ${r.y})`;
    case 'fill': return `✓ filled ${r.target} → value ${JSON.stringify(r.value)}`;
    case 'scroll':
      if (r.found) return `✓ ${r.found} is on screen after ${r.scrolls} scroll(s) ${r.direction}; snapshot ids refreshed, act on it by id ${r.id} or by the same query`;
      return `✓ scrolled ${r.direction}; take a new snapshot`;
    case 'swipe': return `✓ swiped (${r.x1}, ${r.y1}) → (${r.x2}, ${r.y2})`;
    case 'tapXY': return `✓ tapped (${r.x}, ${r.y})`;
    case 'type': return `✓ typed ${JSON.stringify(r.text)}`;
    case 'key': return `✓ pressed ${r.key}`;
    case 'button': return `✓ pressed ${r.name}`;
    case 'openurl': return `✓ opened ${r.url}`;
    case 'screenshot': return `✓ wrote ${r.out}`;
    case 'launch': return `✓ launched ${r.bundleId} (pid ${r.pid})`;
    case 'relaunch': case 'restart': {
      const what = r.installed ? `installed ${r.installed} and relaunched` : 'relaunched';
      const reuse = cmd === 'restart' ? ' in the running session' : '';
      return `✓ ${what} ${r.bundleId} (pid ${r.pid})${reuse}${r.ready === false ? '; accessibility tree not readable yet, snapshot again shortly' : ''}`;
    }
    case 'sessionUrl': return r.url;
    case 'runNew': case 'runCurrent':
      return r.run ? `${r.run}\n${r.path}` : '(no run yet)';
    case 'consoleList':
      if (!r.entries.length) return '(no console entries match)';
      return [...r.entries.map(consoleLine), ...(r.total > r.entries.length ? [`(${r.total - r.entries.length} earlier; raise --limit)`] : [])].join('\n');
    case 'consoleGet':
      return [`#${r.index} [--] ${r.level}`, `time:      ${r.time}`, `source:    ${r.source}`,
        ...(r.subsystem ? [`subsystem: ${r.subsystem}${r.category ? ` (${r.category})` : ''}`] : []), '', r.message].join('\n');
    default: return JSON.stringify(r, null, 2);
  }
}

function formatStatus(s, sessionFile) {
  return [
    `✓ session running (daemon pid ${s.pid}, since ${s.startedAt})`,
    `  device:  ${s.deviceName ?? '?'} (${s.udid})`,
    `  app:     ${s.bundleId}${s.appPid ? ` (pid ${s.appPid})` : ''}${s.appPath ? `  ${s.appPath}` : ''}`,
    `  helper:  ${s.helper.alive ? 'running' : 'idle'}${s.helper.restarts ? `, restarted ${s.helper.restarts}x` : ''}`,
    `  console: ${s.logs.entries} entries${s.logs.streaming ? '' : ' (log stream not running)'}`,
    ...(s.sessionUrl ? [`  fullstory: ${s.sessionUrl}`] : []),
    `  session: ${sessionFile}`,
    ...(s.run ? [`  run:     ${s.run.run} (${s.run.seq} entries)`] : []),
  ].join('\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prepareDevice(flags, out) {
  const device = simctl.pickDevice(await simctl.listDevices(), flags.device);
  if (device.state !== 'Booted') {
    out(`booting ${device.name} (${device.udid})…`);
    await simctl.boot(device.udid);
  }
  if (!(await simctl.accessibilityEnabled(device.udid))) {
    // The accessibility server reads this only at boot, so the first enable needs one reboot.
    out(`enabling app accessibility on ${device.name}; rebooting it once…`);
    await simctl.enableAccessibility(device.udid);
    await simctl.shutdown(device.udid);
    await simctl.boot(device.udid);
  }
  return device;
}

async function resolveApp(flags, udid) {
  const appPath = flags.app ? resolve(flags.app) : null;
  if (appPath && !existsSync(appPath)) throw new SimError('bad_app', `${appPath} does not exist`, 'build the app for the simulator and pass the .app path');
  const bundleId = flags['bundle-id'] ?? (appPath ? await simctl.plistValue(appPath, 'CFBundleIdentifier') : null);
  if (!bundleId) throw new SimError('usage', 'start needs --app PATH or --bundle-id ID');
  if (appPath) await simctl.install(udid, appPath);
  const installed = appPath ?? await simctl.appContainer(udid, bundleId);
  const processName = await simctl.plistValue(installed, 'CFBundleExecutable');
  return { appPath, bundleId, processName };
}

async function waitForDaemon(sightmapDir, child, logFile) {
  let exited = null;
  child.on('exit', (code) => { exited = code ?? 1; });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (exited !== null) {
      const tail = existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter((l) => !l.includes('helper:')).at(-1) : '';
      throw new SimError('daemon_failed', `the daemon exited during startup: ${tail}`, `see ${logFile}`);
    }
    const session = readSession(sightmapDir);
    if (session?.pid === child.pid) return session;
    await sleep(150);
  }
  throw new SimError('daemon_timeout', 'the daemon did not start within 90 s', `see ${logFile}`);
}

async function start(flags, sightmapDir, out) {
  const existing = await liveSession(sightmapDir);
  if (existing) {
    if (flags.device && flags.device !== existing.udid && flags.device !== existing.deviceName) {
      throw new SimError('session_running', `a session is already running on ${existing.deviceName} (${existing.udid})`, 'run `subtext-sim stop` first');
    }
    const appPath = flags.app ? resolve(flags.app) : undefined;
    if (appPath && !existsSync(appPath)) throw new SimError('bad_app', `${appPath} does not exist`, 'build the app for the simulator and pass the .app path');
    const wanted = flags['bundle-id'] ?? (appPath ? await simctl.plistValue(appPath, 'CFBundleIdentifier') : existing.bundleId);
    if (wanted !== existing.bundleId) {
      throw new SimError('session_running', `a session for ${existing.bundleId} is already running on ${existing.deviceName ?? existing.udid}; it can't switch to ${wanted}`,
        `run \`subtext-sim stop\`, then \`subtext-sim start ${appPath ? `--app ${JSON.stringify(appPath)}` : `--bundle-id ${wanted}`} --detach\``);
    }
    const r = await call(existing.socket, 'restart', { appPath });
    return { cmd: 'restart', result: r };
  }

  const t0 = Date.now();
  const [helperPath, device] = await Promise.all([buildHelper(), prepareDevice(flags, out)]);
  const app = await resolveApp(flags, device.udid);
  const runDir = join(CACHE_ROOT, 'sessions', device.udid);
  mkdirSync(runDir, { recursive: true });
  const config = {
    udid: device.udid, deviceName: `${device.name}, iOS ${device.runtimeVersion}`, ...app, sightmapDir, helperPath, runDir, runLabel: flags.runLabel,
  };

  let session;
  let foreground = null;
  if (flags.detach) {
    const logFile = join(runDir, 'daemon.log');
    const fd = openSync(logFile, 'w');
    const child = spawn(process.execPath, [BIN, '__daemon', JSON.stringify(config)], { detached: true, stdio: ['ignore', fd, fd] });
    closeSync(fd);
    session = await waitForDaemon(sightmapDir, child, logFile);
    child.unref();
  } else {
    foreground = await runDaemon(config);
    session = foreground.record;
  }
  const ready = await call(session.socket, 'ready', {}).catch((err) => ({ ready: false, error: err }));
  return { cmd: 'start', result: { ...session, sessionFile: join(sightmapDir, SESSION_FILE), ready, seconds: (Date.now() - t0) / 1000 }, foreground };
}

function formatStart(r, cwd) {
  const lines = [
    `✓ simulator session started in ${r.seconds.toFixed(1)} s`,
    `  device:  ${r.deviceName} (${r.udid})`,
    `  app:     ${r.appPath ? `installed ${r.appPath} and launched ${r.bundleId}` : `launched ${r.bundleId} (already installed)`}`,
    `  daemon:  pid ${r.pid}; session file ${relative(cwd, r.sessionFile) || r.sessionFile}`,
    `  run:     ${r.run} (\`subtext-sim run tail --follow\` to follow)`,
  ];
  if (r.ready?.error) lines.push(`  ⚠ accessibility tree not readable yet: ${r.ready.error.message}${r.ready.error.hint ? `. Next: ${r.ready.error.hint}` : ''}`);
  else if (r.ready && !r.ready.ready) lines.push('  ⚠ the app shows no interactive elements yet; snapshot again shortly');
  lines.push('  next:    subtext-sim snapshot');
  return lines.join('\n');
}

export function formatRunEntry(e) {
  if (e.action === 'session') return `${e.seq} ${e.ts} session ${e.url}`;
  const t = e.target;
  const target = t ? ` → ${t.id} ${t.component ? `[${t.component}]` : t.role}${t.identifier ? ` ${t.identifier}` : ''}${t.text ? ` ${JSON.stringify(t.text)}` : ''}` : '';
  const args = Object.entries(e.args ?? {}).filter(([k]) => k !== 'target').map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
  return `${e.seq} ${e.ts} ${e.ok ? '✓' : '✗'} ${e.action}${args ? ` ${args}` : ''}${target}${e.view ? ` (view ${e.view})` : ''}${e.error ? ` error: ${e.error.message.split('\n')[0]}` : ''}`;
}

async function runTail(flags, sightmapDir, json) {
  let path;
  if (flags.run) path = join(sightmapDir, RUNS_DIR, flags.run.endsWith('.jsonl') ? flags.run : `${flags.run}.jsonl`);
  else {
    const session = await liveSession(sightmapDir);
    path = session ? (await call(session.socket, 'runCurrent')).path : latestRunPath(sightmapDir);
  }
  if (!path || !existsSync(path)) throw new SimError('not_found', 'no run log found', 'run `subtext-sim start --detach` (or `subtext-sim run new`) first');
  let since = flags.since ? num(flags.since, '--since') : 0;
  const emit = () => {
    for (const e of readRun(path, { since })) {
      console.log(json ? JSON.stringify(e) : formatRunEntry(e));
      since = e.seq;
    }
  };
  emit();
  if (!flags.follow) return 0;
  await new Promise((resolveFollow) => {
    process.on('SIGINT', resolveFollow);
    process.on('SIGTERM', resolveFollow);
    setInterval(emit, 500);
  });
  return 0;
}

function printError(err, json) {
  const wire = toWire(err);
  if (json) {
    console.log(JSON.stringify({ ok: false, error: wire }));
    return;
  }
  const [first, ...rest] = wire.message.split('\n');
  console.error(`error: ${first}${wire.hint ? `. Next: ${wire.hint}` : ''}`);
  if (rest.length) console.error(rest.join('\n'));
}

export async function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  if (argv[0] === '__daemon') {
    const config = JSON.parse(argv[1]);
    let stopped;
    const done = new Promise((r) => { stopped = r; });
    const { stop } = await runDaemon({ ...config, onStopped: () => stopped() });
    const onSignal = () => stop().then(() => stopped());
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    await done;
    process.exit(0);
  }

  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    printError(err, argv.includes('--json'));
    return 2;
  }
  const { command, flags } = parsed;
  const json = !!flags.json;
  const print = (cmd, result) => console.log(json ? JSON.stringify({ ok: true, result }) : formatResult(cmd, result));

  try {
    if (command === 'help' || flags.help) {
      console.log(USAGE);
      return 0;
    }
    if (command === 'doctor') {
      const { doctor } = await import('./doctor.mjs');
      const checks = await doctor({ fix: !!flags.fix });
      return checks.some((c) => c.ok === false) ? 1 : 0;
    }
    const sightmapDir = findSightmapDir(cwd, flags['sightmap-dir']);
    if (command === 'start') {
      const { cmd, result, foreground } = await start({ ...flags, runLabel: flags.label }, sightmapDir, (m) => { if (!json) console.error(m); });
      if (json) console.log(JSON.stringify({ ok: true, result: { ...result, ready: result.ready?.error ? { ready: false, error: toWire(result.ready.error) } : result.ready } }));
      else console.log(cmd === 'restart' ? formatResult('restart', result) : formatStart(result, cwd));
      if (foreground) {
        if (!json) console.error('daemon running in the foreground; Ctrl-C or `subtext-sim stop` ends it (use --detach in scripts)');
        await new Promise((resolveStop) => {
          const end = () => foreground.stop().then(resolveStop);
          process.on('SIGINT', end);
          process.on('SIGTERM', end);
          const timer = setInterval(() => { if (!existsSync(join(sightmapDir, SESSION_FILE))) { clearInterval(timer); resolveStop(); } }, 500);
        });
      }
      return 0;
    }
    if (command === 'status') {
      const session = await liveSession(sightmapDir);
      if (!session) {
        if (json) console.log(JSON.stringify({ ok: true, result: { running: false } }));
        else console.log('✗ no running session. Next: run `subtext-sim start --detach`');
        return 1;
      }
      const s = await call(session.socket, 'status');
      if (json) console.log(JSON.stringify({ ok: true, result: { running: true, ...s } }));
      else console.log(formatStatus(s, relative(cwd, session.file) || session.file));
      return 0;
    }
    if (command === 'stop') {
      const session = readSession(sightmapDir);
      if (!session || !pidAlive(session.pid)) {
        print('stop', { stopped: false });
        if (!json) console.log('(no running session)');
        return 0;
      }
      await call(session.socket, 'stop', { shutdown: !!flags.shutdown });
      for (let i = 0; i < 50 && pidAlive(session.pid); i++) await sleep(100);
      if (json) console.log(JSON.stringify({ ok: true, result: { stopped: true, shutdown: !!flags.shutdown } }));
      else console.log(`✓ stopped${flags.shutdown ? '; simulator shut down' : ''}`);
      return 0;
    }

    const request = toRequest(parsed, cwd);
    if (!request && command === 'run') return await runTail(flags, sightmapDir, json);
    const session = await requireSession(sightmapDir);
    const result = await call(session.socket, request.cmd, request.args);
    print(request.cmd, result);
    if (request.cmd === 'snapshot' && result.coverage?.interactive === 0) {
      console.error('error: 0 interactive elements; the app may still be loading. Next: wait a moment and snapshot again');
      return 1;
    }
    return 0;
  } catch (err) {
    printError(err, json);
    return err.code === 'usage' ? 2 : 1;
  }
}
