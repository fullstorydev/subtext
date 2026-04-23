import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Lightweight browser shim. We only use the subset of DOM surface the
// channel touches: window.addEventListener('message', fn), MessageEvent,
// Window-like target.postMessage. Full jsdom would work but costs a dep
// for just a few tests.
//
// Hoisted before the imports below so the channel module picks up the
// shimmed globals at load time.
let listeners: Array<(evt: MessageEventLike) => void> = [];

class FakeWindow {
  postMessage = (...args: unknown[]) => {
    this.postCalls.push(args);
  };
  postCalls: unknown[][] = [];
}

interface MessageEventLike {
  source: unknown;
  origin: string;
  data: unknown;
}

const fakeWindow = {
  addEventListener(type: string, fn: (evt: MessageEventLike) => void): void {
    if (type === 'message') listeners.push(fn);
  },
  removeEventListener(type: string, fn: (evt: MessageEventLike) => void): void {
    if (type === 'message') {
      listeners = listeners.filter(l => l !== fn);
    }
  },
};

(globalThis as unknown as { window: typeof fakeWindow }).window = fakeWindow;

function deliver(evt: MessageEventLike): void {
  for (const l of listeners) l(evt);
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EmbedHostChannel } = await import('../src/channel.js');

// ---------------------------------------------------------------------------

const APP_HOST = 'https://app.fullstory.test:8043';

beforeEach(() => {
  listeners = [];
});

test('TOKEN_REQUEST → refreshAuthToken → TOKEN_RESPOND with matching reqId', async () => {
  const iframe = new FakeWindow();
  const refresh = async () => ({ token: 'tok-1', expiresAt: '2099-01-01T00:00:00Z' });
  const channel = new EmbedHostChannel({
    target: iframe as unknown as Window,
    targetOrigin: APP_HOST,
    refreshAuthToken: refresh,
  });

  deliver({
    source: iframe,
    origin: APP_HOST,
    data: { name: 'ST_EMBED_TOKEN_REQUEST', reqId: 'r-1' },
  });

  // refreshAuthToken is async; yield once for the microtask to settle.
  await new Promise(r => setTimeout(r, 0));

  assert.equal(iframe.postCalls.length, 1);
  const [payload, targetOrigin] = iframe.postCalls[0]!;
  assert.equal(targetOrigin, APP_HOST);
  const msg = payload as {
    name: string;
    reqId: string;
    body: { tokenType: string; tokenString: string; expiresAt?: string };
  };
  assert.equal(msg.name, 'ST_EMBED_TOKEN_RESPOND');
  assert.equal(msg.reqId, 'r-1');
  assert.equal(msg.body.tokenType, 'Bearer');
  assert.equal(msg.body.tokenString, 'tok-1');
  assert.equal(msg.body.expiresAt, '2099-01-01T00:00:00Z');

  channel.dispose();
});

test('refreshAuthToken returning a bare string is wrapped into TokenData', async () => {
  const iframe = new FakeWindow();
  const channel = new EmbedHostChannel({
    target: iframe as unknown as Window,
    targetOrigin: APP_HOST,
    refreshAuthToken: async () => 'raw-tok',
  });
  deliver({
    source: iframe,
    origin: APP_HOST,
    data: { name: 'ST_EMBED_TOKEN_REQUEST', reqId: 'r-2' },
  });
  await new Promise(r => setTimeout(r, 0));
  const msg = iframe.postCalls[0]![0] as {
    body: { tokenString: string; expiresAt?: string };
  };
  assert.equal(msg.body.tokenString, 'raw-tok');
  assert.equal(msg.body.expiresAt, undefined);
  channel.dispose();
});

test('refreshAuthToken throwing reports via onError with auth_failed', async () => {
  const iframe = new FakeWindow();
  let reported: { code: string; message?: string } | undefined;
  const channel = new EmbedHostChannel({
    target: iframe as unknown as Window,
    targetOrigin: APP_HOST,
    refreshAuthToken: async () => {
      throw new Error('mint failed');
    },
    onError: e => {
      reported = e;
    },
  });
  deliver({
    source: iframe,
    origin: APP_HOST,
    data: { name: 'ST_EMBED_TOKEN_REQUEST', reqId: 'r-3' },
  });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(iframe.postCalls.length, 0); // no TOKEN_RESPOND
  assert.ok(reported);
  assert.equal(reported!.code, 'auth_failed');
  assert.equal(reported!.message, 'mint failed');
  channel.dispose();
});

test('READY_EVT fires onReady', () => {
  const iframe = new FakeWindow();
  let readyCount = 0;
  const channel = new EmbedHostChannel({
    target: iframe as unknown as Window,
    targetOrigin: APP_HOST,
    refreshAuthToken: async () => 'x',
    onReady: () => {
      readyCount++;
    },
  });
  deliver({ source: iframe, origin: APP_HOST, data: { name: 'ST_EMBED_READY_EVT' } });
  assert.equal(readyCount, 1);
  channel.dispose();
});

test('ERROR_EVT from iframe fires onError with the reported code', () => {
  const iframe = new FakeWindow();
  let reported: { code: string; message?: string } | undefined;
  const channel = new EmbedHostChannel({
    target: iframe as unknown as Window,
    targetOrigin: APP_HOST,
    refreshAuthToken: async () => 'x',
    onError: e => {
      reported = e;
    },
  });
  deliver({
    source: iframe,
    origin: APP_HOST,
    data: { name: 'ST_EMBED_ERROR_EVT', code: 'trace_not_found', message: 'missing' },
  });
  assert.ok(reported);
  assert.equal(reported!.code, 'trace_not_found');
  assert.equal(reported!.message, 'missing');
  channel.dispose();
});

test('MODE_CHANGED fires onModeChanged with the new mode', () => {
  const iframe = new FakeWindow();
  let observed: string | null = null;
  const channel = new EmbedHostChannel({
    target: iframe as unknown as Window,
    targetOrigin: APP_HOST,
    refreshAuthToken: async () => 'x',
    onModeChanged: m => {
      observed = m;
    },
  });
  deliver({
    source: iframe,
    origin: APP_HOST,
    data: { name: 'ST_EMBED_MODE_CHANGED', mode: 'review' },
  });
  assert.equal(observed, 'review');
  channel.dispose();
});

test('messages from unexpected origins are dropped', () => {
  const iframe = new FakeWindow();
  let readyCount = 0;
  const channel = new EmbedHostChannel({
    target: iframe as unknown as Window,
    targetOrigin: APP_HOST,
    refreshAuthToken: async () => 'x',
    onReady: () => {
      readyCount++;
    },
  });
  deliver({
    source: iframe,
    origin: 'https://evil.example',
    data: { name: 'ST_EMBED_READY_EVT' },
  });
  assert.equal(readyCount, 0);
  channel.dispose();
});

test('messages from other sources (same origin) are dropped', () => {
  const iframe = new FakeWindow();
  const other = new FakeWindow();
  let readyCount = 0;
  const channel = new EmbedHostChannel({
    target: iframe as unknown as Window,
    targetOrigin: APP_HOST,
    refreshAuthToken: async () => 'x',
    onReady: () => {
      readyCount++;
    },
  });
  deliver({
    source: other, // different source but same origin
    origin: APP_HOST,
    data: { name: 'ST_EMBED_READY_EVT' },
  });
  assert.equal(readyCount, 0);
  channel.dispose();
});

test('unknown ST_EMBED_* names are no-ops (forward compat)', () => {
  const iframe = new FakeWindow();
  const channel = new EmbedHostChannel({
    target: iframe as unknown as Window,
    targetOrigin: APP_HOST,
    refreshAuthToken: async () => 'x',
  });
  deliver({
    source: iframe,
    origin: APP_HOST,
    data: { name: 'ST_EMBED_FUTURE_EVT', whatever: true },
  });
  // No crash, no post.
  assert.equal(iframe.postCalls.length, 0);
  channel.dispose();
});

test('pushToken posts TOKEN_RESPOND without a reqId', async () => {
  const iframe = new FakeWindow();
  const channel = new EmbedHostChannel({
    target: iframe as unknown as Window,
    targetOrigin: APP_HOST,
    refreshAuthToken: async () => ({ token: 'push-tok', expiresAt: '2099-01-01T00:00:00Z' }),
  });
  await channel.pushToken();
  assert.equal(iframe.postCalls.length, 1);
  const msg = iframe.postCalls[0]![0] as { name: string; reqId?: string; body: unknown };
  assert.equal(msg.name, 'ST_EMBED_TOKEN_RESPOND');
  assert.equal(msg.reqId, undefined);
  channel.dispose();
});

test('dispose removes the listener; subsequent deliveries are ignored', () => {
  const iframe = new FakeWindow();
  let readyCount = 0;
  const channel = new EmbedHostChannel({
    target: iframe as unknown as Window,
    targetOrigin: APP_HOST,
    refreshAuthToken: async () => 'x',
    onReady: () => {
      readyCount++;
    },
  });
  channel.dispose();
  deliver({ source: iframe, origin: APP_HOST, data: { name: 'ST_EMBED_READY_EVT' } });
  assert.equal(readyCount, 0);
});
