/**
 * Loopback resolver tests. The DNS-pinning behavior is the load-bearing
 * defense against rebinding, so verify it explicitly.
 *
 * We monkey-patch dns.promises.lookup to control resolution outcomes — that's
 * the cleanest way to exercise both the loopback-pass and non-loopback-reject
 * paths without standing up a real resolver.
 */
import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {promises as dns} from 'node:dns';

import {isLoopbackIP, resolveLoopbackOrigin} from '../src/loopback.js';

const realLookup = dns.lookup.bind(dns);

describe('isLoopbackIP', () => {
  it('accepts 127.0.0.0/8', () => {
    assert.ok(isLoopbackIP('127.0.0.1'));
    assert.ok(isLoopbackIP('127.0.0.2'));
    assert.ok(isLoopbackIP('127.255.255.255'));
  });
  it('accepts ::1 in any normalization', () => {
    assert.ok(isLoopbackIP('::1'));
    assert.ok(isLoopbackIP('0:0:0:0:0:0:0:1'));
  });
  it('rejects everything else', () => {
    assert.ok(!isLoopbackIP('10.0.0.1'));
    assert.ok(!isLoopbackIP('192.168.1.1'));
    assert.ok(!isLoopbackIP('169.254.1.1'));
    assert.ok(!isLoopbackIP('100.64.0.1'));
    assert.ok(!isLoopbackIP('8.8.8.8'));
    assert.ok(!isLoopbackIP('::'));
    assert.ok(!isLoopbackIP('fe80::1'));
  });
});

describe('resolveLoopbackOrigin', () => {
  let stub: ((hostname: string, opts?: unknown) => Promise<{address: string; family: number}>) | null = null;

  beforeEach(() => {
    // Patch dns.lookup to whatever the test sets via `stub`.
    (dns as unknown as {lookup: unknown}).lookup = (hostname: string, opts?: unknown) => {
      if (stub) return stub(hostname, opts);
      return realLookup(hostname, opts as never);
    };
  });

  afterEach(() => {
    (dns as unknown as {lookup: unknown}).lookup = realLookup;
    stub = null;
  });

  it('passes through IPv4 loopback IP literals without lookup', async () => {
    let called = false;
    stub = async () => {
      called = true;
      return {address: '8.8.8.8', family: 4};
    };
    const r = await resolveLoopbackOrigin('http://127.0.0.1:3000');
    assert.equal(r.resolvedIp, '127.0.0.1');
    assert.equal(r.ipUrl, 'http://127.0.0.1:3000');
    assert.equal(called, false, 'must not call dns.lookup for IP literals');
  });

  it('resolves loopback hostnames and rewrites URL to IP', async () => {
    stub = async (hostname: string) => {
      assert.equal(hostname, 'foo.myapp.test');
      return {address: '127.0.0.1', family: 4};
    };
    const r = await resolveLoopbackOrigin('http://foo.myapp.test:3000');
    assert.equal(r.hostname, 'foo.myapp.test');
    assert.equal(r.resolvedIp, '127.0.0.1');
    assert.equal(r.ipUrl, 'http://127.0.0.1:3000');
    assert.equal(r.port, '3000');
  });

  it('rejects when DNS resolves to a non-loopback address (rebinding defense)', async () => {
    stub = async () => ({address: '198.51.100.42', family: 4});
    await assert.rejects(
      () => resolveLoopbackOrigin('http://evil.example.com:3000'),
      /loopback check failed.*198\.51\.100\.42/,
    );
  });

  it('rejects non-loopback IP literal even without DNS', async () => {
    stub = async () => {
      throw new Error('should not be called');
    };
    await assert.rejects(
      () => resolveLoopbackOrigin('http://192.168.1.1:3000'),
      /loopback check failed/,
    );
  });

  it('handles IPv6 loopback', async () => {
    stub = async () => ({address: '::1', family: 6});
    const r = await resolveLoopbackOrigin('http://localhost:3000');
    assert.equal(r.resolvedIp, '::1');
    assert.equal(r.ipUrl, 'http://[::1]:3000');
  });
});
