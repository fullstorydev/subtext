import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatResult, formatRunEntry, parseArgs, toRequest } from '../lib/cli.mjs';
import { call, readSession } from '../lib/client.mjs';
import { runDaemon, SimSession } from '../lib/daemon.mjs';
import { HelperClient } from '../lib/helper-client.mjs';
import { ConsoleBuffer, LogCollector, parseLogLine, sessionEndIn } from '../lib/logs.mjs';
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

test('parseArgs takes -i as a flag and refuses a flag-looking token as a value', () => {
  assert.deepEqual(parseArgs(['console', 'list', '-i', '--grep', '206']).flags, { 'ignore-case': true, grep: '206' });
  assert.deepEqual(parseArgs(['console', 'list', '--grep', '206', '--ignore-case']).flags, { grep: '206', 'ignore-case': true });
  assert.throws(() => parseArgs(['console', 'list', '--grep', '-i', '206']), (err) => err.code === 'usage' && /--grep needs a value, but got the flag -i/.test(err.message) && /--grep=-i/.test(err.hint));
  assert.throws(() => parseArgs(['console', 'list', '--grep']), { code: 'usage' });
  assert.throws(() => parseArgs(['console', 'list', '--grep', '--']), { code: 'usage' });
  assert.deepEqual(parseArgs(['console', 'list', '--grep', '--', '-i', '--json']).flags, { grep: '-i', json: true });
  assert.equal(parseArgs(['console', 'list', '--grep=-i']).flags.grep, '-i');
  assert.equal(parseArgs(['scroll', 'down', '--max', '-1']).flags.max, '-1');
  assert.deepEqual(parseArgs(['fill', 'login-email', '', '--clear']).positionals, ['login-email', '']);
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
  const { record, stop, session: daemonSession } = await runDaemon({
    udid: 'FAKE-UDID', deviceName: 'Fake Phone', bundleId: 'dev.example.app', processName: 'App', sightmapDir,
    helperPath: process.execPath, onStopped: () => { stopped = true; },
    timing: { settleMs: 0, scrollSettleMs: 0, readyTimeoutMs: 1000, retryIntervalMs: 0, retryTimeoutMs: 100 },
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

  assert.deepEqual(await call(sock, 'click', { target: 'go' }), { target: '2 button[identifier="go"] "Go"', x: 60, y: 30, retries: 0 });
  assert.deepEqual((await call(sock, 'click', { target: '2' })).y, 30);
  assert.deepEqual((await call(sock, 'click', { target: 'button[text="Go"]' })).x, 60);
  await assert.rejects(call(sock, 'click', { target: 'far' }), (err) => err.code === 'offscreen' && /scroll down --until/.test(err.hint));
  await assert.rejects(call(sock, 'click', { target: 'under' }), { code: 'covered' });
  await assert.rejects(call(sock, 'click', { target: 'nope' }), { code: 'disabled' });
  await assert.rejects(call(sock, 'click', { target: 'Missing' }), (err) => err.code === 'not_found' && /long lists/.test(err.message));
  assert.equal(inputs().filter((i) => i.cmd === 'tap').length, 3);

  await daemonSession.helper.request('arm');
  const late = await call(sock, 'click', { target: 'late' });
  assert.ok(late.retries >= 2, `a button that appears a moment later is tapped after re-reads (${late.retries})`);
  await daemonSession.helper.request('arm');
  const mover = await call(sock, 'click', { target: 'mover' });
  assert.equal(mover.y, 320, 'a sliding button is tapped where it stops');
  assert.ok(mover.retries >= 1);
  assert.match(formatResult('click', mover), /after \d+ re-read\(s\) while the screen settled/);

  const filled = await call(sock, 'fill', { target: 'email', text: 'a@b.co' });
  assert.equal(filled.value, 'a@b.co');
  assert.equal((await call(sock, 'fill', { target: 'email', text: 'x@y.z', clear: true })).value, 'x@y.z');
  const cleared = await call(sock, 'fill', { target: 'email', text: '', clear: true });
  assert.deepEqual([cleared.value, cleared.placeholder], ['', 'Email'], 'a cleared field showing its placeholder is empty');
  assert.match(formatResult('fill', cleared), /value "" \(empty; the field shows its placeholder "Email"\)/);

  await call(sock, 'scroll', { direction: 'down' });
  assert.deepEqual(inputs().at(-1), { cmd: "swipe", args: { udid: "FAKE-UDID", x1: 200, y1: 640, x2: 200, y2: 160, duration: 1.6 } });
  await assert.rejects(call(sock, 'scroll', { direction: 'down', until: 'far', max: 2 }), { code: 'not_found' });

  await call(sock, 'tapXY', { x: 1, y: 2 });
  await assert.rejects(call(sock, 'tapXY', { x: 230, y: 1450 }), (err) => err.code === 'off_screen_point' && /400x800 pt screen/.test(err.message) && /not pixels/.test(err.message));
  await assert.rejects(call(sock, 'swipe', { x1: 10, y1: 10, x2: 10, y2: 900 }), { code: 'off_screen_point' });
  await call(sock, 'key', { key: 'return' });
  await call(sock, 'openurl', { url: 'app://x' });
  assert.deepEqual(simctl.calls.at(-1), ['openUrl', 'FAKE-UDID', 'app://x']);
  await assert.rejects(call(sock, 'sessionUrl'), { code: 'no_session_url' });
  await checkSessionEnd(sock, daemonSession);
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
  assert.equal(formatResult('restart', { bundleId: 'dev.x', pid: 7, installed: '/b/X.app', ready: true }), '✓ installed /b/X.app and relaunched dev.x (pid 7) in the running session');
  assert.equal(formatResult('restart', { bundleId: 'dev.x', pid: 7, installed: null, ready: true }), '✓ relaunched dev.x (pid 7) in the running session');
  assert.equal(formatResult('relaunch', { bundleId: 'dev.x', pid: 7 }), '✓ relaunched dev.x (pid 7)');

  await call(sock, 'stop', { shutdown: true });
  for (let i = 0; i < 50 && !stopped; i++) await new Promise((r) => setTimeout(r, 20));
  assert.ok(stopped);
  assert.ok(!existsSync(join(sightmapDir, '.sim-session')));
  assert.deepEqual(simctl.calls.slice(-2).map((c) => c[0]), ['terminate', 'shutdown']);
});

const URL_1 = 'https://app.fullstory.com/ui/o-TEST01-na1/session/1111111111111111111%3A2222222222222222222';
const URL_2 = 'https://app.fullstory.com/ui/o-TEST01-na1/session/1111111111111111111%3A3333333333333333333';
const sdkLine = (eventMessage, messageType = 'Default') => JSON.stringify({
  eventType: 'logEvent', messageType, subsystem: 'com.fullstory.FullStory', category: 'FullStory', processID: 4242, timestamp: '2026-10-28 14:02:11.123456-0700', eventMessage,
});

test('Fullstory SDK termination lines are recognized', () => {
  assert.equal(sessionEndIn('Received HTTP Status Code: 206, terminating FullStory session').status, 206);
  assert.match(sessionEndIn('[FullStory] Received HTTP Status Code: 206, terminating FullStory session').reason, /too large/);
  assert.match(sessionEndIn('FullStory: Received HTTP Status Code: 202, terminating FullStory session').reason, /recording is blocked/);
  assert.equal(sessionEndIn('capture is terminated; not resuming session').status, null);
  assert.deepEqual(sessionEndIn('WARNING: Maximum number of views reached'), { warning: 'the Fullstory SDK logged "Maximum number of views reached"' });
  assert.equal(sessionEndIn('Received HTTP Status Code: 200'), null);
  assert.equal(sessionEndIn('POST /orders 206'), null);
});

/** Feeds `log stream` lines through the daemon's log ingestion and checks the run log, `session-url` and `status`. */
async function checkSessionEnd(sock, session) {
  const logs = new LogCollector({ udid: 'FAKE-UDID', processName: 'App', buffer: session.buffer });
  const runEntries = async () => readRun((await call(sock, 'runCurrent')).path);
  logs.ingest(sdkLine(`FULLSTORY_SESSION_URL ${URL_1}`, 'Info'));
  assert.deepEqual(await call(sock, 'sessionUrl', {}), { url: URL_1, ended: false });
  logs.ingest(sdkLine('Maximum number of views reached; some views will not be captured', 'Error'));
  logs.ingest(sdkLine('Received HTTP Status Code: 206, terminating FullStory session', 'Error'));
  logs.ingest(sdkLine('capture is terminated; not resuming session'));

  const ended = (await runEntries()).filter((e) => e.action === 'session-ended');
  assert.equal(ended.length, 1, 'one session-ended entry per session');
  assert.equal(ended[0].url, URL_1);
  assert.equal(ended[0].status, 206);
  assert.match(ended[0].reason, /HTTP 206.*too large.*Maximum number of views reached/);
  assert.ok(ended[0].ts);
  assert.match(formatRunEntry(ended[0]), /session-ended https:\/\/app\.fullstory\.com\/.* HTTP 206/);

  await assert.rejects(call(sock, 'sessionUrl', {}), (err) => err.code === 'session_ended' && err.message.includes(URL_1) && /relaunch/.test(err.hint));
  const asJson = await call(sock, 'sessionUrl', { json: true });
  assert.deepEqual([asJson.url, asJson.ended], [URL_1, true]);
  assert.match(asJson.reason, /206/);
  assert.match((await call(sock, 'status')).sessionEnded.reason, /206/);

  logs.ingest(sdkLine(`FULLSTORY_SESSION_URL ${URL_2}`, 'Info'));
  assert.deepEqual(await call(sock, 'sessionUrl', {}), { url: URL_2, ended: false });
  assert.equal((await call(sock, 'status')).sessionEnded, null);
  const sessions = (await runEntries()).filter((e) => e.action === 'session' || e.action === 'session-ended').map((e) => `${e.action} ${e.url}`);
  assert.deepEqual(sessions, [`session ${URL_1}`, `session-ended ${URL_1}`, `session ${URL_2}`]);
}

function stubSession({ describe, accessibilityEnabled }) {
  const helper = { request: async () => describe(), close() {}, alive: true, restarts: 0 };
  const simctl = accessibilityEnabled === undefined ? {} : { accessibilityEnabled: async () => accessibilityEnabled };
  return new SimSession({ udid: 'U-1', bundleId: 'dev.x', processName: 'X', sightmapDir: join(dir, 'stub', '.sightmap'), helper, simctl,
    timing: { overlaySettleMs: 0, settleMs: 0, scrollSettleMs: 0, retryIntervalMs: 0, retryTimeoutMs: 20 } });
}

const axDisabled = () => { throw Object.assign(new Error('no elements'), { code: 'ax_disabled' }); };

test('an empty tree lists the likely causes, dropping app accessibility when it is on', async () => {
  const off = stubSession({ describe: axDisabled, accessibilityEnabled: false });
  await assert.rejects(off.handle('snapshot', {}), (err) => {
    assert.equal(err.code, 'ax_disabled');
    const lines = err.message.split('\n');
    assert.match(lines[1], /^ {2}1\. .*accessibilityViewIsModal.*no-hide-descendants/);
    assert.match(lines[2], /^ {2}2\. App accessibility is off.*xcrun simctl spawn U-1 defaults write/);
    assert.match(lines[3], /^ {2}3\. A system sheet/);
    return true;
  });
  const on = stubSession({ describe: axDisabled, accessibilityEnabled: true });
  await assert.rejects(on.handle('snapshot', {}), (err) => {
    assert.match(err.message, /App accessibility is enabled on this simulator, so that is not the cause/);
    assert.doesNotMatch(err.message, /defaults write/);
    assert.equal(err.message.split('\n').length, 3);
    return true;
  });
});

test('a snapshot showing only a small floating element says the app window is hidden', async () => {
  const el = (type, frame, extra = {}) => ({ role: `AX${type}`, type, label: null, identifier: null, value: null, frame, enabled: true, children: [], ...extra });
  const describe = () => ({
    screen: { w: 390, h: 844 },
    root: el('Application', { x: 0, y: 0, w: 390, h: 844 }, { label: 'App', children: [el('Button', { x: 330, y: 700, w: 48, h: 48 }, { label: 'Dev menu' })] }),
  });
  const snap = await stubSession({ describe, accessibilityEnabled: true }).handle('snapshot', {});
  assert.match(snap.text, /\[Mostly empty\]\nOnly a small floating element is exposed \(button "Dev menu"\)/);
  assert.match(snap.text, /no-hide-descendants/);
  assert.doesNotMatch(snap.text, /defaults write/);
});

test('click, fill and scroll on a mostly empty tree give the empty-tree diagnosis, not the long-list hint', async () => {
  const el = (type, frame, extra = {}) => ({ role: `AX${type}`, type, label: null, identifier: null, value: null, frame, enabled: true, children: [], ...extra });
  const floating = () => ({
    screen: { w: 390, h: 844 },
    root: el('Application', { x: 0, y: 0, w: 390, h: 844 }, { label: 'App', children: [el('Button', { x: 330, y: 700, w: 48, h: 48 }, { label: 'Dev menu' })] }),
  });
  const sparse = (err) => {
    assert.equal(err.code, 'not_found');
    assert.match(err.message, /exposes next to nothing to accessibility/);
    assert.match(err.message, /Only a small floating element is exposed \(button "Dev menu"\)/);
    assert.match(err.message, /no-hide-descendants/);
    assert.doesNotMatch(err.message, /defaults write/);
    assert.doesNotMatch(`${err.message} ${err.hint}`, /long lists|further down a list, run/);
    return true;
  };
  const session = stubSession({ describe: floating, accessibilityEnabled: true });
  await assert.rejects(session.handle('click', { target: 'profile-avatar' }), sparse);
  await assert.rejects(session.handle('fill', { target: 'login-email', text: 'a' }), sparse);
  await assert.rejects(session.handle('scroll', { direction: 'down', until: 'login-email', max: 3 }), sparse);

  const loading = () => ({ screen: { w: 390, h: 844 }, root: el('Application', { x: 0, y: 0, w: 390, h: 844 }, { label: 'App', children: [
    el('StaticText', { x: 0, y: 100, w: 390, h: 600 }, { label: 'Loading…' }), el('StaticText', { x: 0, y: 700, w: 390, h: 40 }, { label: 'v1' })] }) });
  await assert.rejects(stubSession({ describe: loading, accessibilityEnabled: false }).handle('click', { target: 'go' }),
    (err) => /no interactive elements/.test(err.message) && /defaults write/.test(err.message));
});
