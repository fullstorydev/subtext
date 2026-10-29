import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { createInterface } from 'node:readline';
import { BridgeError, annotate, centerOf, render, resolve as resolveQuery, sparseTreeNote, toComponentTree, writeSnap } from './sightmap-bridge.mjs';
import { FLOATING_MARGIN, floatingControls, logBoxToast, normalize } from './normalize.mjs';
import { emptyTreeMessage, SimError, toWire } from './errors.mjs';
import { ConsoleBuffer, LogCollector } from './logs.mjs';
import { HelperClient } from './helper-client.mjs';
import { CorpusCache } from './sightmap-cli.mjs';
import * as realSimctl from './simctl.mjs';
import { RunLog, targetOf } from './runlog.mjs';

export const SESSION_FILE = '.sim-session';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quote = (s) => JSON.stringify(String(s));

export function socketPathFor(sightmapDir, udid) {
  const hash = createHash('sha256').update(`${resolvePath(sightmapDir)}\0${udid}`).digest('hex').slice(0, 12);
  return join(tmpdir(), `subtext-sim-${hash}.sock`);
}

/** One line per node, in the snapshot's own notation. */
export function describeNode(node) {
  let body;
  if (node.component) {
    const entries = Object.entries(node.props ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const props = entries.map(([k, v]) => `${k}=${quote(v)}`);
    const showLabel = node.label && !entries.some(([, v]) => v === node.label);
    body = `[${[node.component, ...props, ...(showLabel ? [quote(node.label)] : [])].join(' ')}]`;
  } else {
    body = node.tag;
    if (node.identifier) body += `[identifier=${quote(node.identifier)}]`;
    if (node.label) body += ` ${quote(node.label)}`;
  }
  return `${node.id} ${body}`;
}

function bridgeToSim(err) {
  if (err instanceof BridgeError) return new SimError(err.code, err.message);
  return err;
}

/**
 * Resolves a target against a snapshot: a snapshot id, an exact accessibility
 * identifier, or a component query (sightmap-bridge `resolve`).
 */
export function resolveTarget(annotated, target) {
  const text = String(target).trim();
  if (!/^\d+$/.test(text) && /^[^\s[\]"'#]+$/.test(text)) {
    const byIdentifier = annotated.nodes.filter((n) => n.identifier === text);
    if (byIdentifier.length === 1) return byIdentifier[0];
    if (byIdentifier.length > 1) {
      const lines = byIdentifier.map(describeNode);
      throw new SimError('ambiguous', `identifier ${quote(text)} is on ${byIdentifier.length} elements; use a snapshot id or \`${byIdentifier[0].tag}[identifier=${quote(text)}]#N\`:\n  ${lines.join('\n  ')}`, 'pick one by snapshot id');
    }
  }
  try {
    return resolveQuery(annotated, text);
  } catch (err) {
    throw bridgeToSim(err);
  }
}

const isAncestor = (a, node) => {
  for (let p = node.parent; p; p = p.parent) if (p === a) return true;
  return false;
};

const OBSTRUCTING = new Set(['tabbar', 'keyboard', 'navbar', 'toolbar']);
const OBSTRUCTING_LABELS = new Set(['Tab Bar', 'Toolbar']);

const obstructs = (o) => OBSTRUCTING.has(o.tag) || (o.tag === 'other' && OBSTRUCTING_LABELS.has(o.label));
const barName = (o) => (OBSTRUCTING.has(o.tag) ? o.tag : o.label.toLowerCase());

/**
 * A JS tab bar (React Navigation) has no container element, only its tabs; the
 * band from the top of a bottom row of tabs to the screen's bottom stands in.
 */
function tabBand({ nodes, screen }) {
  const tabs = nodes.filter((n) => n.tag === 'tab' && n.visible && !hasAncestorTag(n, 'tabbar'));
  if (!tabs.length) return null;
  const y = Math.min(...tabs.map((t) => t.frame.y));
  if (y < screen.h / 2) return null;
  return { tag: 'tabbar', label: null, identifier: null, value: null, enabled: true, visible: true, children: [],
    frame: { x: 0, y, w: screen.w, h: screen.h - y } };
}

function hasAncestorTag(node, tag) {
  for (let p = node.parent; p; p = p.parent) if (p.tag === tag) return true;
  return false;
}

/** A point inside the node's frame, on screen and outside `zone`, nearest its center; or null. */
function clearSpot(node, zone, screen) {
  const { x, y, w, h } = node.frame;
  const c = centerOf(node);
  const points = [0.15, 0.3, 0.5, 0.7, 0.85].flatMap((fx) => [0.25, 0.5, 0.75].map((fy) => ({ x: Math.round(x + w * fx), y: Math.round(y + h * fy) })));
  const clear = points.filter((p) => p.x >= 0 && p.y >= 0 && p.x <= screen.w && p.y <= screen.h
    && !(p.x >= zone.x && p.x <= zone.x + zone.w && p.y >= zone.y && p.y <= zone.y + zone.h));
  return clear.sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0] ?? null;
}

/** Throws unless the node's center is on screen, uncovered by bars or the keyboard, and enabled. */
export function assertActionable(annotated, node, target) {
  const { screen } = annotated;
  const desc = describeNode(node);
  if (!node.visible || !node.onScreen) {
    const { x, y, w, h } = node.frame;
    const dir = y + h / 2 > screen.h ? 'down' : y + h / 2 < 0 ? 'up' : x + w / 2 > screen.w ? 'right' : 'left';
    throw new SimError('offscreen', `${desc} is off-screen (center ${Math.round(x + w / 2)},${Math.round(y + h / 2)} on a ${screen.w}x${screen.h} screen); refusing to tap`,
      `run \`subtext-sim scroll ${dir} --until ${quote(target)}\`, then retry`);
  }
  const c = centerOf(node);
  const band = node.tag === 'tab' ? null : tabBand(annotated);
  const logBox = logBoxToast(annotated);
  const covers = (o) => c.x >= o.frame.x && c.x <= o.frame.x + o.frame.w && c.y >= o.frame.y && c.y <= o.frame.y + o.frame.h;
  if (logBox && logBox.node !== node && covers(logBox.node)) {
    throw new SimError('covered', `${desc} is covered by a React Native LogBox toast (${describeNode(logBox.node)})`,
      `dismiss it with \`subtext-sim tap-xy ${logBox.dismiss.x} ${logBox.dismiss.y}\` (its ✕), then retry`);
  }
  const unrelated = (o) => o !== node && !isAncestor(o, node) && !isAncestor(node, o);
  const zoneOf = ({ frame: { x, y, w, h } }) => ({ x: x - FLOATING_MARGIN, y: y - FLOATING_MARGIN, w: w + 2 * FLOATING_MARGIN, h: h + 2 * FLOATING_MARGIN });
  const inside = (p, z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
  const floating = floatingControls(annotated).find((f) => unrelated(f) && inside(c, zoneOf(f)));
  if (floating) {
    const spot = clearSpot(node, zoneOf(floating), screen);
    const away = spot ? `tap another part of the target with \`subtext-sim tap-xy ${spot.x} ${spot.y}\`` : 'scroll the target away from it';
    throw new SimError('covered', `${desc} is within ${FLOATING_MARGIN} pt of ${describeNode(floating)}, which looks like the React Native / Expo dev-menu button. It floats in its own window and catches taps beyond its frame, so tapping (${Math.round(c.x)}, ${Math.round(c.y)}) would likely open the dev menu`,
      `${away}, or hide the floating button (Expo dev client: open the dev menu, Settings, turn off "Show floating action button"; reopen the menu later with Device → Shake in Simulator), then retry`);
  }
  const cover = [...annotated.nodes, ...(band ? [band] : [])].find((o) => obstructs(o) && o.visible && o !== node && !isAncestor(o, node) && !isAncestor(node, o)
    && covers(o));
  if (cover) {
    const hint = cover.tag === 'keyboard'
      ? 'dismiss the keyboard (`subtext-sim key return`) or scroll, then retry'
      : `scroll it clear of the ${barName(cover)} (\`subtext-sim scroll down\` or \`up\`), then retry`;
    throw new SimError('covered', `${desc} is covered by the ${barName(cover)} (${describeNode(cover)})`, hint);
  }
  if (!node.enabled) throw new SimError('disabled', `${desc} is disabled`);
}

/** Finds the element a previous snapshot's node refers to in a fresh snapshot. */
export function relocate(fresh, node, target) {
  if (!/^\d+$/.test(String(target).trim())) return resolveTarget(fresh, target);
  const same = fresh.nodes.filter((n) => n.tag === node.tag && n.identifier === node.identifier && n.label === node.label);
  if (!same.length) throw new SimError('stale_target', `element ${describeNode(node)} is no longer on screen`);
  const c = centerOf(node);
  const dist = (n) => Math.hypot(centerOf(n).x - c.x, centerOf(n).y - c.y);
  return same.sort((a, b) => dist(a) - dist(b))[0];
}

function scrollVector(direction, region) {
  const { x, y, w, h } = region;
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (direction) {
    case 'down': return { x1: cx, y1: y + h * 0.8, x2: cx, y2: y + h * 0.2 };
    case 'up': return { x1: cx, y1: y + h * 0.2, x2: cx, y2: y + h * 0.8 };
    case 'right': return { x1: x + w * 0.8, y1: cy, x2: x + w * 0.2, y2: cy };
    case 'left': return { x1: x + w * 0.2, y1: cy, x2: x + w * 0.8, y2: cy };
    default: throw new SimError('usage', `scroll direction must be up, down, left or right, not ${quote(direction)}`);
  }
}

function clip(frame, screen) {
  const x = Math.max(0, frame.x);
  const y = Math.max(0, frame.y);
  return { x, y, w: Math.min(screen.w, frame.x + frame.w) - x, h: Math.min(screen.h, frame.y + frame.h) - y };
}

const SECURE = new Set(['securetextfield']);

// Errors that can clear up once a sheet or navigation finishes animating.
const RETRYABLE = new Set(['not_found', 'stale_target', 'covered', 'offscreen', 'disabled']);

/** Frames only: labels such as clocks and counters change without anything moving. */
const layoutOf = (snap) => snap.nodes.map((n) => `${n.tag}|${n.identifier}|${Math.round(n.frame.x)},${Math.round(n.frame.y)},${Math.round(n.frame.w)},${Math.round(n.frame.h)}`).join('\n');

// Points per second. Faster swipes fling the list, which can carry a target
// past the screen between two reads; this speed stops where the finger stops.
const SCROLL_SPEED = 300;

const ACTION_BY_CMD = {
  snapshot: 'snapshot', click: 'click', fill: 'fill', scroll: 'scroll', swipe: 'swipe', tapXY: 'tap-xy',
  button: 'button', key: 'key', type: 'type', openurl: 'openurl', launch: 'launch', relaunch: 'launch', restart: 'launch',
};

/** The command engine behind the socket. Dependencies are injectable so tests can fake the helper and simctl. */
export class SimSession {
  constructor({ udid, deviceName = null, bundleId, appPath = null, processName, sightmapDir, runDir, helper, simctl = realSimctl, logs = null, buffer = new ConsoleBuffer(), corpus = new CorpusCache(sightmapDir), log = () => {}, timing = {} }) {
    Object.assign(this, { udid, deviceName, bundleId, appPath, processName, sightmapDir, runDir, helper, simctl, logs, buffer, corpus, log });
    this.timing = { settleMs: 350, scrollSettleMs: 150, overlaySettleMs: 800, fillReadbackMs: 2000, readyTimeoutMs: 20_000, retryIntervalMs: 150, retryTimeoutMs: 1500, ...timing };
    this.last = null;
    this.lastView = null;
    this.lastTarget = null;
    this.appPid = null;
    this.runLog = new RunLog(sightmapDir);
    this.buffer.onSessionUrl = (url) => this.runLog.run && this.runLog.append({ action: 'session', url });
    this.buffer.onSessionEnded = ({ url, reason, status }) => {
      this.log(`fullstory session ended: ${reason}`);
      if (this.runLog.run) this.runLog.append({ action: 'session-ended', url, reason, status });
    };
    this.startedAt = new Date().toISOString();
  }

  get stdoutPath() {
    return this.runDir ? join(this.runDir, 'app-stdout.log') : undefined;
  }

  get stderrPath() {
    return this.runDir ? join(this.runDir, 'app-stderr.log') : undefined;
  }

  async describe() {
    return this.helper.request('describe', { udid: this.udid });
  }

  /** A system sheet animating in leaves no readable tree for a moment; once it settles, describe shows it. */
  async describeSettled() {
    try {
      const result = await this.describe();
      this.readable = true;
      return result;
    } catch (err) {
      if (err.code !== 'ax_disabled' || !this.readable) throw err;
      await sleep(this.timing.overlaySettleMs);
      return this.describe();
    }
  }

  async fresh({ view } = {}) {
    let described;
    try {
      described = await this.describeSettled();
    } catch (err) {
      if (err.code === 'ax_disabled') throw await this.emptyTreeError();
      throw err;
    }
    try {
      const snap = annotate(normalize(described), this.corpus.get(), { view });
      this.lastView = snap.view;
      this.screen = snap.screen;
      return snap;
    } catch (err) {
      throw bridgeToSim(err);
    }
  }

  async accessibilityEnabled() {
    if (this.axEnabled === undefined) {
      this.axEnabled = this.simctl.accessibilityEnabled ? await this.simctl.accessibilityEnabled(this.udid).catch(() => null) : null;
    }
    return this.axEnabled;
  }

  /** The not-found error for a sparse tree, naming its likely causes; null when the tree looks healthy. */
  async sparseTreeError(snap, message) {
    const note = sparseTreeNote(snap, { udid: this.udid, accessibilityEnabled: await this.accessibilityEnabled() });
    if (!note) return null;
    return new SimError('not_found', `${message}; the screen exposes next to nothing to accessibility, so the target is not just further down a list:\n${note.join('\n')}`,
      'check the causes listed, in order, then snapshot again');
  }

  async emptyTreeError() {
    return new SimError('ax_disabled', emptyTreeMessage({ udid: this.udid, accessibilityEnabled: await this.accessibilityEnabled() }));
  }

  /** Re-describes until two reads agree on every element's frame, so a list's momentum has stopped. */
  async settled({ timeoutMs = 4000 } = {}) {
    const layout = (snap) => snap.nodes.map((n) => `${n.tag}|${n.identifier}|${n.label}|${Math.round(n.frame.x)},${Math.round(n.frame.y)}`).join('\n');
    let snap = await this.fresh();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(150);
      const next = await this.fresh();
      if (layout(next) === layout(snap)) return next;
      snap = next;
    }
    return snap;
  }

  input(cmd, args) {
    return this.helper.request(cmd, { udid: this.udid, ...args });
  }

  async launchApp({ terminate = true } = {}) {
    if (terminate) await this.simctl.enableAccessibility(this.udid);
    this.appPid = await this.simctl.launch(this.udid, this.bundleId, { stdout: this.stdoutPath, stderr: this.stderrPath, terminate });
    this.axEnabled = undefined;
    this.readable = false;
    this.last = null;
    return { bundleId: this.bundleId, pid: this.appPid };
  }

  /** Waits until the accessibility tree is readable, which lags the launch by a moment. */
  async waitReady() {
    const deadline = Date.now() + this.timing.readyTimeoutMs;
    let lastErr;
    while (Date.now() < deadline) {
      try {
        const snap = await this.fresh();
        if (snap.coverage.interactive > 0) return { ready: true, interactive: snap.coverage.interactive };
      } catch (err) {
        lastErr = err;
        if (!['ax_error', 'ax_unavailable', 'ax_disabled', 'helper_crashed'].includes(err.code)) throw err;
      }
      await sleep(500);
    }
    if (lastErr) throw lastErr;
    return { ready: false, interactive: 0 };
  }

  async handle(cmd, args = {}) {
    const fn = this.commands[cmd];
    if (!fn) throw new SimError('unknown_cmd', `unknown daemon command ${quote(cmd)}`);
    const action = ACTION_BY_CMD[cmd];
    if (!action) return fn.call(this, args);
    this.lastTarget = null;
    const logArgs = Object.fromEntries(Object.entries(args).filter(([k, v]) => v !== undefined && k !== 'json'));
    const redact = () => {
      if (cmd === 'fill' && SECURE.has(this.lastTarget?.tag)) logArgs.text = '<redacted>';
    };
    try {
      const result = await fn.call(this, args);
      redact();
      this.logStep(action, logArgs, true);
      return result;
    } catch (err) {
      redact();
      this.logStep(action, logArgs, false, err);
      throw err;
    }
  }

  logStep(action, args, ok, err) {
    try {
      this.runLog.append({
        action, args, target: targetOf(this.lastTarget), view: this.lastView, ok,
        ...(err ? { error: { code: err.code ?? 'internal', message: err.message } } : {}),
      });
    } catch (e) {
      this.log(`run log write failed: ${e.message}`);
    }
  }

  commands = {
    ping() {
      return { pong: true };
    },

    ready() {
      return this.waitReady();
    },

    runNew({ label }) {
      const run = this.runLog.begin(label);
      if (this.buffer.sessionUrl) this.runLog.append({ action: 'session', url: this.buffer.sessionUrl });
      const ended = this.buffer.sessionEnded;
      if (ended) this.runLog.append({ action: 'session-ended', url: ended.url, reason: ended.reason, status: ended.status });
      return run;
    },

    runCurrent() {
      return { run: this.runLog.run, path: this.runLog.path, label: this.runLog.label, seq: this.runLog.seq };
    },

    status() {
      return {
        udid: this.udid,
        deviceName: this.deviceName,
        bundleId: this.bundleId,
        appPath: this.appPath,
        appPid: this.appPid,
        pid: process.pid,
        startedAt: this.startedAt,
        helper: { alive: this.helper.alive, restarts: this.helper.restarts },
        logs: { streaming: this.logs?.streaming ?? false, entries: this.buffer.nextIndex },
        sessionUrl: this.buffer.sessionUrl,
        sessionEnded: this.buffer.sessionEnded,
        run: { run: this.runLog.run, path: this.runLog.path, seq: this.runLog.seq },
      };
    },

    async snapshot({ view, includeOffscreen = false, out, treeOut, json = false }) {
      const snap = await this.fresh({ view });
      if (sparseTreeNote(snap)) {
        Object.assign(snap, { udid: this.udid, accessibilityEnabled: await this.accessibilityEnabled() });
        snap.text = render(snap);
      }
      this.last = snap;
      const text = includeOffscreen ? render(snap, { includeOffscreen: true }) : snap.text;
      if (out) writeSnap({ ...snap, text }, out);
      if (treeOut) {
        mkdirSync(dirname(treeOut), { recursive: true });
        writeFileSync(treeOut, JSON.stringify({ tree: toComponentTree(snap, { annotations: true }) }));
      }
      const result = { text, view: snap.view, viewInferred: snap.viewInferred, coverage: snap.coverage, conflicts: snap.conflicts };
      if (json) result.tree = toComponentTree(snap, { annotations: true });
      return result;
    },

    async click({ target }) {
      const { node, ...tapped } = await this.tap(target);
      return tapped;
    },

    async fill({ target, text, clear = false }) {
      if (typeof text !== 'string') throw new SimError('usage', 'fill needs the text to type');
      const tapped = await this.tap(target);
      await sleep(this.timing.settleMs);
      let placeholder = null;
      if (clear) {
        const field = relocate(await this.fresh(), tapped.node, target);
        const count = (field.value ?? '').length;
        for (let i = 0; i < count; i++) await this.input('key', { key: 'forward_delete' });
        for (let i = 0; i < count; i++) await this.input('key', { key: 'delete' });
        if (count) await sleep(this.timing.settleMs);
        // Every character is deleted by now; a field that still shows text shows its placeholder.
        placeholder = relocate(await this.fresh(), tapped.node, target).value;
      }
      if (text) await this.input('type', { text });
      const stuck = (n) => SECURE.has(n.tag) || !text || (n.value ?? '').toLowerCase().includes(text.toLowerCase());
      let after;
      const deadline = Date.now() + this.timing.fillReadbackMs;
      do {
        await sleep(this.timing.settleMs);
        after = relocate(await this.fresh(), tapped.node, target);
      } while (!stuck(after) && Date.now() < deadline);
      const showsPlaceholder = !!placeholder && after.value === placeholder && !text;
      const value = showsPlaceholder ? '' : after.value ?? '';
      if (!stuck(after)) {
        throw new SimError('fill_mismatch', `typed ${quote(text)} but ${describeNode(after)} shows ${quote(value)}`,
          'retry with --clear, or check with `subtext-sim snapshot` that the field took focus');
      }
      return {
        target: tapped.target, x: tapped.x, y: tapped.y, retries: tapped.retries,
        value: SECURE.has(after.tag) ? `(${value.length} secure characters)` : value,
        ...(showsPlaceholder ? { placeholder } : {}),
      };
    },

    async scroll({ direction, within, until, max = 20 }) {
      let snap = await this.fresh();
      let region = { x: 0, y: 0, w: snap.screen.w, h: snap.screen.h };
      if (within) {
        const container = resolveTarget(snap, within);
        this.lastTarget = container;
        region = clip(container.frame, snap.screen);
      }
      const vector = scrollVector(direction, region);
      const distance = Math.hypot(vector.x2 - vector.x1, vector.y2 - vector.y1);
      const duration = Math.max(0.3, Math.round((distance / SCROLL_SPEED) * 100) / 100);
      const swipe = () => this.input('swipe', { ...vector, duration });
      if (!until) {
        await swipe();
        await sleep(this.timing.scrollSettleMs);
        await this.settled();
        this.last = null;
        return { direction, scrolls: 1 };
      }
      let previous = null;
      for (let i = 0; i <= max; i++) {
        if (i > 0) snap = await this.settled();
        let found = null;
        try {
          found = resolveTarget(snap, until);
          assertActionable(snap, found, until);
          this.lastTarget = found;
          this.last = snap;
          return { direction, scrolls: i, found: describeNode(found), id: found.id };
        } catch (err) {
          if (!['not_found', 'offscreen', 'covered'].includes(err.code)) throw err;
        }
        if (i === 0) {
          const sparse = await this.sparseTreeError(snap, `${quote(until)} not found`);
          if (sparse) throw sparse;
        }
        if (previous !== null && previous === snap.text) {
          this.last = snap;
          const sparse = await this.sparseTreeError(snap, `${quote(until)} not found`);
          if (sparse) throw sparse;
          throw new SimError('not_found', `${quote(until)} not found; reached the end after scrolling ${direction} ${i} time(s)`,
            `try \`subtext-sim scroll ${direction === 'down' ? 'up' : direction === 'up' ? 'down' : direction === 'left' ? 'right' : 'left'} --until ${quote(until)}\``);
        }
        previous = snap.text;
        if (i === max) break;
        await swipe();
        await sleep(this.timing.scrollSettleMs);
      }
      this.last = snap;
      const sparse = await this.sparseTreeError(snap, `${quote(until)} not found`);
      if (sparse) throw sparse;
      throw new SimError('not_found', `${quote(until)} not found after ${max} scroll(s) ${direction}`, 'raise --max, or check the query with `subtext-sim snapshot`');
    },

    async swipe({ x1, y1, x2, y2, duration }) {
      await this.assertOnScreen([[x1, y1], [x2, y2]], 'swipe');
      await this.input('swipe', { x1, y1, x2, y2, ...(duration ? { duration } : {}) });
      this.last = null;
      return { x1, y1, x2, y2 };
    },

    async tapXY({ x, y }) {
      await this.assertOnScreen([[x, y]], 'tap-xy');
      await this.input('tap', { x, y });
      return { x, y };
    },

    async button({ name }) {
      await this.input('button', { name });
      return { name };
    },

    async key({ key }) {
      await this.input('key', { key });
      return { key };
    },

    async type({ text }) {
      await this.input('type', { text });
      return { text };
    },

    async openurl({ url }) {
      await this.simctl.openUrl(this.udid, url);
      this.last = null;
      return { url };
    },

    async screenshot({ out }) {
      await this.simctl.screenshot(this.udid, out);
      return { out };
    },

    launch() {
      return this.launchApp({ terminate: false });
    },

    async relaunch() {
      const r = await this.launchApp({ terminate: true });
      return { ...r, ...(await this.waitReady().catch(() => ({ ready: false }))) };
    },

    async restart({ appPath }) {
      if (appPath) {
        await this.simctl.install(this.udid, appPath);
        this.appPath = appPath;
      }
      return { ...(await this.commands.relaunch.call(this)), installed: appPath ?? null };
    },

    consoleList({ limit = 50, grep, level, all }) {
      return this.buffer.list({ limit, grep, level, all });
    },

    consoleGet({ index }) {
      const entry = this.buffer.get(Number(index));
      if (!entry) throw new SimError('not_found', `no console entry #${index} (the buffer holds the most recent ${this.buffer.capacity})`, 'run `subtext-sim console list` for current indexes');
      return entry;
    },

    sessionUrl({ json = false } = {}) {
      const ended = this.buffer.sessionEnded;
      if (ended) {
        if (json) return { url: ended.url, ended: true, reason: ended.reason, endedAt: ended.time };
        throw new SimError('session_ended', `the Fullstory session ${ended.url ?? '(no URL logged)'} ended at ${ended.time}: ${ended.reason}`,
          'run `subtext-sim relaunch` to start a new session, then `subtext-sim session-url` for its URL');
      }
      if (!this.buffer.sessionUrl) {
        throw new SimError('no_session_url', 'the app has not logged a Fullstory session URL',
          'the app needs the Fullstory iOS SDK (for the sample app: FS_ORG_ID=<org> fixtures/SampleApp/build.sh), then `subtext-sim relaunch`');
      }
      return { url: this.buffer.sessionUrl, ended: false };
    },
  };

  /** Rejects points outside the screen, in points as `describe` reports it. Without a readable tree, the last known size applies. */
  async assertOnScreen(points, cmd) {
    const screen = this.screen ?? (await this.fresh().catch(() => null))?.screen;
    if (!screen?.w || !screen?.h) return;
    const outside = points.find(([x, y]) => x < 0 || y < 0 || x > screen.w || y > screen.h);
    if (outside) {
      throw new SimError('off_screen_point', `(${outside[0]}, ${outside[1]}) is outside the ${screen.w}x${screen.h} pt screen; ${cmd} takes screen points (origin top-left), not pixels`,
        `pick a point within 0–${screen.w} x 0–${screen.h}; divide screenshot pixel coordinates by the device scale (2 or 3)`);
    }
  }

  /**
   * Re-describes, re-resolves the target, checks it is tappable, and taps its
   * center. Right after a sheet closes or a navigation pops, the target can be
   * missing or still moving, so it re-reads every `retryIntervalMs` until two
   * reads agree and the target is there, for up to `retryTimeoutMs`.
   */
  async tap(target) {
    const numeric = /^\d+$/.test(String(target).trim());
    const base = this.last;
    if (numeric && !base) throw new SimError('not_found', `no snapshot to resolve id ${target} against`, 'run `subtext-sim snapshot` first');
    const view = base?.viewInferred === false ? base.view ?? undefined : undefined;
    const original = numeric ? resolveTarget(base, target) : null;
    const locate = (snap) => (numeric ? relocate(snap, original, target) : resolveTarget(snap, target));
    const deadline = Date.now() + this.timing.retryTimeoutMs;
    let retries = 0;
    let stable = false;
    let snap = await this.fresh({ view });
    for (;;) {
      let node = null;
      let failure = null;
      try {
        node = locate(snap);
        assertActionable(snap, node, target);
      } catch (err) {
        if (!(err instanceof SimError) || !RETRYABLE.has(err.code)) throw err;
        failure = err;
      }
      if (node) this.lastTarget = node;
      const outOfTime = Date.now() >= deadline;
      if (!failure && (stable || outOfTime)) {
        const { x, y } = centerOf(node);
        await this.input('tap', { x, y });
        return { target: describeNode(node), x: Math.round(x), y: Math.round(y), retries, node };
      }
      const waitable = failure && (failure.code === 'not_found' || failure.code === 'stale_target' || !stable);
      if (failure && (outOfTime || !waitable)) throw await this.notFound(snap, target, failure, numeric);
      await sleep(this.timing.retryIntervalMs);
      const next = await this.fresh({ view });
      stable = layoutOf(next) === layoutOf(snap);
      if (failure || !stable) retries++;
      snap = next;
    }
  }

  /** The error for a target that never became tappable: the sparse-tree diagnosis, the long-list hint, or the error itself. */
  async notFound(snap, target, err, numeric) {
    if (err.code !== 'not_found') return err;
    const sparse = await this.sparseTreeError(snap, err.message);
    if (sparse) return sparse;
    if (numeric) return err;
    return new SimError('not_found', `${err.message}; long lists expose only the rows near the screen`,
      `if it is further down a list, run \`subtext-sim scroll down --until ${quote(target)}\`; otherwise \`subtext-sim snapshot\``);
  }

  close() {
    this.helper.close();
    this.logs?.close();
  }
}

/**
 * Runs the daemon: owns the helper, the console collector and the last
 * snapshot, serves the CLI over a Unix socket, and records the session in
 * `.sightmap/.sim-session`. Resolves with `{ session, stop }` once serving.
 */
export async function runDaemon(config, { simctl = realSimctl, helperArgs = [], withLogs = true, log = (m) => console.error(`[${new Date().toISOString()}] ${m}`) } = {}) {
  const { udid, deviceName, bundleId, appPath, processName, sightmapDir, helperPath, runDir, launch = true } = config;
  mkdirSync(sightmapDir, { recursive: true });
  if (runDir) mkdirSync(runDir, { recursive: true });
  const helper = new HelperClient(helperPath, helperArgs, { log });
  const buffer = new ConsoleBuffer();
  const session = new SimSession({ udid, deviceName, bundleId, appPath, processName, sightmapDir, runDir, helper, simctl, buffer, log, timing: config.timing });
  if (runDir) for (const p of [session.stdoutPath, session.stderrPath]) writeFileSync(p, '');
  if (withLogs) {
    session.logs = new LogCollector({ udid, processName, stdoutPath: session.stdoutPath, stderrPath: session.stderrPath, buffer, log });
    session.logs.start();
    await sleep(500);
  }
  helper.start();
  const hello = await helper.request('hello');
  log(`helper ${hello.version} ready`);
  session.runLog.begin(config.runLabel);
  if (launch) {
    await session.launchApp({ terminate: true });
    log(`launched ${bundleId} (pid ${session.appPid})`);
  }
  session.runLog.append({ action: 'start', args: { udid, deviceName, bundleId, appPath: appPath ?? null }, target: null, view: null, ok: true });

  const socketPath = config.socketPath ?? socketPathFor(sightmapDir, udid);
  if (existsSync(socketPath)) unlinkSync(socketPath);
  const sessionFile = join(sightmapDir, SESSION_FILE);
  let queue = Promise.resolve();
  let stopping = null;

  const stop = async ({ shutdown = false, terminateApp = true } = {}) => {
    stopping ??= (async () => {
      log('stopping');
      if (terminateApp) await simctl.terminate(udid, bundleId);
      if (shutdown) await simctl.shutdown(udid);
      session.close();
      server.close();
      rmSync(socketPath, { force: true });
      rmSync(sessionFile, { force: true });
    })();
    return stopping;
  };

  const server = createServer((socket) => {
    socket.on('error', () => {});
    const rl = createInterface({ input: socket });
    rl.once('line', async (line) => {
      let req;
      try {
        req = JSON.parse(line);
      } catch {
        socket.end(`${JSON.stringify({ ok: false, error: { code: 'bad_request', message: 'request is not JSON' } })}\n`);
        return;
      }
      const reply = (msg) => socket.end(`${JSON.stringify({ id: req.id, ...msg })}\n`);
      if (req.cmd === 'stop') {
        reply({ ok: true, result: { stopped: true, shutdown: !!req.args?.shutdown } });
        await stop({ shutdown: !!req.args?.shutdown });
        config.onStopped?.();
        return;
      }
      const run = () => session.handle(req.cmd, req.args ?? {});
      const task = req.cmd === 'status' || req.cmd === 'ping' ? run() : (queue = queue.then(run, run));
      try {
        reply({ ok: true, result: await task });
      } catch (err) {
        if (!(err instanceof SimError)) log(`internal error in ${req.cmd}: ${err.stack ?? err}`);
        reply({ ok: false, error: toWire(err) });
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  const record = {
    socket: socketPath, udid, deviceName, bundleId, appPath: appPath ?? null, pid: process.pid,
    startedAt: session.startedAt, run: session.runLog.run, runDir: runDir ?? null, logFile: runDir ? join(runDir, 'daemon.log') : null,
  };
  writeFileSync(sessionFile, `${JSON.stringify(record, null, 2)}\n`);
  log(`serving on ${socketPath}`);
  return { session, stop, record, socketPath };
}
