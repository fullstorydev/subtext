import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatResult, parseArgs, toRequest } from '../lib/cli.mjs';
import { call, readSession } from '../lib/client.mjs';
import { runDaemon } from '../lib/daemon.mjs';
import { HelperClient } from '../lib/helper-client.mjs';
import { ConsoleBuffer, parseLogLine } from '../lib/logs.mjs';
import { pickDevice } from '../lib/simctl.mjs';
import { readRun } from '../lib/runlog.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FAKE_HELPER = join(here, 'fakes', 'fake-helper.mjs');

test('parseArgs splits command, positionals and flags', () => {
  assert.deepEqual(parseArgs(['fill', 'login-email', 'a@b.co', '--clear']), {
    command: 'fill', positionals: ['login-email', 'a@b.co'], flags: { clear: true },
  });
  assert.deepEqual(parseArgs(['scroll', 'down', '--until=ProductRow[title="A b"]', '--in', 'list']).flags, { until: 'ProductRow[title="A b"]', in: 'list' });
  assert.deepEqual(parseArgs(['type', '--', '--not-a-flag']).positionals, ['--not-a-flag']);
  assert.equal(parseArgs([]).command, 'help');
  assert.throws(() => parseArgs(['snapshot', '--bogus']), { code: 'usage' });
  assert.throws(() => parseArgs(['start', '--device']), { code: 'usage' });
  assert.throws(() => parseArgs(['snapshot', '--json=1']), { code: 'usage' });
});

test('toRequest maps commands onto daemon requests', () => {
  const req = (argv) => toRequest(parseArgs(argv), '/proj');
  assert.deepEqual(req(['click', 'SignInButton']), { cmd: 'click', args: { target: 'SignInButton' } });
  assert.deepEqual(req(['tap-xy', '10', '20.5']), { cmd: 'tapXY', args: { x: 10, y: 20.5 } });
  assert.deepEqual(req(['screenshot', '--out', 'shots/a.png']), { cmd: 'screenshot', args: { out: '/proj/shots/a.png' } });
  assert.deepEqual(req(['console', 'list', '--limit', '5', '--level', 'error']), { cmd: 'consoleList', args: { limit: 5, grep: undefined, level: 'error', all: false } });
  assert.equal(req(['console', 'list', '--all']).args.all, true);
  assert.deepEqual(req(['console', 'get', '7']), { cmd: 'consoleGet', args: { index: 7 } });
  assert.deepEqual(req(['scroll', 'down', '--until', 'far', '--max', '3']), { cmd: 'scroll', args: { direction: 'down', within: undefined, until: 'far', max: 3 } });
  assert.deepEqual(req(['run', 'new', '--label', 'checkout']), { cmd: 'runNew', args: { label: 'checkout' } });
  assert.equal(req(['run', 'tail']), null);
  assert.equal(req(['start']), null);
  assert.throws(() => req(['scroll', 'sideways']), { code: 'usage' });
  assert.throws(() => req(['tap-xy', '1']), { code: 'usage' });
  assert.throws(() => req(['tap-xy', 'a', '1']), { code: 'usage' });
  assert.throws(() => req(['screenshot']), { code: 'usage' });
  assert.throws(() => req(['frobnicate']), { code: 'usage' });
});

test('pickDevice prefers an exact UDID, then name, then a booted device', () => {
  const devices = [
    { udid: 'A', name: 'iPhone 16', state: 'Shutdown', runtimeVersion: '18.5' },
    { udid: 'B', name: 'iPhone 17 Pro', state: 'Shutdown', runtimeVersion: '26.2' },
    { udid: 'C', name: 'iPad Air', state: 'Booted', runtimeVersion: '26.2' },
  ];
  assert.equal(pickDevice(devices, 'a').udid, 'A');
  assert.equal(pickDevice(devices, 'iPhone 17 Pro').udid, 'B');
  assert.equal(pickDevice(devices).udid, 'C');
  assert.equal(pickDevice(devices.slice(0, 2)).udid, 'B');
  assert.throws(() => pickDevice(devices, 'Pixel'), { code: 'device_not_found' });
});

test('log lines parse into console entries and surface the session URL', () => {
  const line = JSON.stringify({ eventType: 'logEvent', messageType: 'Error', subsystem: 'dev.x', category: 'app', eventMessage: 'boom', timestamp: 't' });
  assert.deepEqual(parseLogLine(line), { time: 't', level: 'error', source: 'os_log', subsystem: 'dev.x', category: 'app', message: 'boom' });
  assert.equal(parseLogLine('Filtering the log data'), null);
  assert.equal(parseLogLine(JSON.stringify({ eventType: 'activityCreateEvent', eventMessage: 'x' })), null);

  const buf = new ConsoleBuffer(3);
  const seen = [];
  buf.onSessionUrl = (url) => seen.push(url);
  for (const message of ['a', 'FULLSTORY_SESSION_URL https://app.example/s/1', 'b', 'c']) buf.push({ level: 'info', message });
  assert.deepEqual(buf.entries.map((e) => e.index), [1, 2, 3]);
  assert.equal(buf.sessionUrl, 'https://app.example/s/1');
  assert.deepEqual(seen, ['https://app.example/s/1']);
  assert.deepEqual(buf.list({ grep: 'B' }).entries.map((e) => e.message), ['b']);
  assert.equal(buf.get(0), null);
});

test('helper client restarts the helper after it dies', async () => {
  const helper = new HelperClient(process.execPath, [FAKE_HELPER]);
  assert.equal((await helper.request('hello')).version, 'fake');
  await assert.rejects(helper.request('crash'), { code: 'helper_crashed' });
  assert.equal((await helper.request('hello')).version, 'fake');
  assert.equal(helper.restarts, 1);
  await assert.rejects(helper.request('nope'), { code: 'unknown_cmd' });
  helper.close();
});

const dir = mkdtempSync(join(tmpdir(), 'subtext-sim-test-'));
let stopDaemon = async () => {};
after(async () => {
  await stopDaemon();
  rmSync(dir, { recursive: true, force: true });
});

function fakeSimctl() {
  const calls = [];
  const rec = (name) => async (...args) => { calls.push([name, ...args]); return name === 'launch' ? 4242 : undefined; };
  return {
    calls,
    enableAccessibility: rec('enableAccessibility'), launch: rec('launch'), terminate: rec('terminate'), shutdown: rec('shutdown'),
    openUrl: rec('openUrl'), screenshot: rec('screenshot'), install: rec('install'),
  };
}

test('daemon serves the protocol over its socket', async () => {
  const sightmapDir = join(dir, '.sightmap');
  const inputLog = join(dir, 'inputs.jsonl');
  writeFileSync(inputLog, '');
  process.env.FAKE_HELPER_LOG = inputLog;
  const simctl = fakeSimctl();
  let stopped = false;
  const { record, stop } = await runDaemon({
    udid: 'FAKE-UDID', deviceName: 'Fake Phone', bundleId: 'dev.example.app', processName: 'App', sightmapDir,
    helperPath: process.execPath, onStopped: () => { stopped = true; }, timing: { settleMs: 0, scrollSettleMs: 0, readyTimeoutMs: 1000 },
  }, { simctl, helperArgs: [FAKE_HELPER], withLogs: false, log: () => {} });
  stopDaemon = stop;
  const inputs = () => readFileSync(inputLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const sock = record.socket;

  const session = readSession(sightmapDir);
  assert.equal(session.udid, 'FAKE-UDID');
  assert.equal(session.socket, sock);
  assert.ok(session.run);
  assert.deepEqual(simctl.calls.map((c) => c[0]), ['enableAccessibility', 'launch']);

  assert.deepEqual(await call(sock, 'ready'), { ready: true, interactive: 4 });
  const snap = await call(sock, 'snapshot', {});
  assert.match(snap.text, /button\[identifier="go"\] "Go"/);
  assert.match(snap.text, /\[Off-screen\]/);
  assert.equal(snap.tree, undefined);
  assert.ok((await call(sock, 'snapshot', { json: true })).tree.children.length);

  assert.deepEqual(await call(sock, 'click', { target: 'go' }), { target: '2 button[identifier="go"] "Go"', x: 60, y: 30 });
  assert.deepEqual((await call(sock, 'click', { target: '2' })).y, 30);
  assert.deepEqual((await call(sock, 'click', { target: 'button[text="Go"]' })).x, 60);
  await assert.rejects(call(sock, 'click', { target: 'far' }), (err) => err.code === 'offscreen' && /scroll down --until/.test(err.hint));
  await assert.rejects(call(sock, 'click', { target: 'under' }), { code: 'covered' });
  await assert.rejects(call(sock, 'click', { target: 'nope' }), { code: 'disabled' });
  await assert.rejects(call(sock, 'click', { target: 'Missing' }), { code: 'not_found' });
  assert.equal(inputs().filter((i) => i.cmd === 'tap').length, 3);

  const filled = await call(sock, 'fill', { target: 'email', text: 'a@b.co' });
  assert.equal(filled.value, 'a@b.co');
  assert.equal((await call(sock, 'fill', { target: 'email', text: 'x@y.z', clear: true })).value, 'x@y.z');

  await call(sock, 'scroll', { direction: 'down' });
  assert.deepEqual(inputs().at(-1), { cmd: "swipe", args: { udid: "FAKE-UDID", x1: 200, y1: 640, x2: 200, y2: 160, duration: 1.6 } });
  await assert.rejects(call(sock, 'scroll', { direction: 'down', until: 'far', max: 2 }), { code: 'not_found' });

  await call(sock, 'tapXY', { x: 1, y: 2 });
  await call(sock, 'key', { key: 'return' });
  await call(sock, 'openurl', { url: 'app://x' });
  assert.deepEqual(simctl.calls.at(-1), ['openUrl', 'FAKE-UDID', 'app://x']);
  await assert.rejects(call(sock, 'sessionUrl'), { code: 'no_session_url' });
  await assert.rejects(call(sock, 'bogus'), { code: 'unknown_cmd' });

  const status = await call(sock, 'status');
  assert.equal(status.appPid, 4242);
  assert.equal(status.helper.alive, true);

  const current = await call(sock, 'runCurrent');
  const entries = readRun(current.path);
  assert.deepEqual(entries.map((e) => e.seq), entries.map((_, i) => i + 1));
  assert.equal(entries[0].action, 'start');
  const firstClick = entries.find((e) => e.action === 'click');
  assert.deepEqual(firstClick.target, { id: 2, component: null, identifier: 'go', text: 'Go', role: 'button' });
  assert.equal(firstClick.ok, true);
  const refused = entries.find((e) => e.action === 'click' && !e.ok);
  assert.equal(refused.error.code, 'offscreen');
  assert.ok(entries.some((e) => e.action === 'tap-xy'));
  assert.ok(!entries.some((e) => e.action === 'status'));
  assert.equal(readRun(current.path, { since: entries.length - 1 }).length, 1);

  const fresh = await call(sock, 'runNew', { label: 'Checkout flow' });
  assert.match(fresh.run, /-checkout-flow$/);
  assert.notEqual(fresh.path, current.path);

  assert.equal(formatResult('click', { target: '2 button "Go"', x: 1, y: 2 }), '✓ clicked 2 button "Go" at (1, 2)');

  await call(sock, 'stop', { shutdown: true });
  for (let i = 0; i < 50 && !stopped; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(stopped);
  assert.ok(!existsSync(join(sightmapDir, '.sim-session')));
  assert.deepEqual(simctl.calls.slice(-2).map((c) => c[0]), ['terminate', 'shutdown']);
});
