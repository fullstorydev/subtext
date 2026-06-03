/**
 * Allowlist parser + matcher tests. Mirrors allowlist_test.go on the Go relay
 * side — input that parses here MUST parse there too, and vice versa, so the
 * client never accepts an entry the relay would reject.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizedFrom,
  matchesAny,
  originPatternString,
  parseOriginPattern,
  parseOriginPatterns,
  patternMatches,
} from '../src/allowlist.js';

describe('parseOriginPattern: accepts', () => {
  // [input, canonical, isIP, expectedCanonicalizedFrom]
  // expectedCanonicalizedFrom is undefined when input was already canonical.
  const cases: Array<[string, string, boolean, string | undefined]> = [
    // Bare host:port — already canonical.
    ['localhost:3000', 'localhost:3000', false, undefined],
    ['127.0.0.1:8080', '127.0.0.1:8080', true, undefined],
    ['[::1]:443', '[::1]:443', true, undefined],
    ['fullstory.test:8043', 'fullstory.test:8043', false, undefined],
    ['app.localhost:3000', 'app.localhost:3000', false, undefined],

    // Bare reserved TLDs.
    ['test:3000', 'test:3000', false, undefined],
    ['localhost:80', 'localhost:80', false, undefined],

    // DNS canonicalization: extra labels collapse to last-two.
    ['www.fullstory.test:8043', 'fullstory.test:8043', false, 'www.fullstory.test:8043'],
    ['foo.bar.fullstory.test:8043', 'fullstory.test:8043', false, 'foo.bar.fullstory.test:8043'],
    ['a.b.app.localhost:3000', 'app.localhost:3000', false, 'a.b.app.localhost:3000'],

    // Case-folding.
    ['WWW.Fullstory.TEST:8043', 'fullstory.test:8043', false, 'WWW.Fullstory.TEST:8043'],
    ['LOCALHOST:3000', 'localhost:3000', false, 'LOCALHOST:3000'],

    // Legacy scheme prefix is silently stripped.
    ['http://fullstory.test:8043', 'fullstory.test:8043', false, 'http://fullstory.test:8043'],
    ['https://localhost:3000', 'localhost:3000', false, 'https://localhost:3000'],

    // Legacy "*." prefix is silently stripped.
    ['*.fullstory.test:8043', 'fullstory.test:8043', false, '*.fullstory.test:8043'],
    ['http://*.fullstory.test:8043', 'fullstory.test:8043', false, 'http://*.fullstory.test:8043'],
  ];
  for (const [input, wantStr, wantIsIP, wantCanonFrom] of cases) {
    it(input, () => {
      const p = parseOriginPattern(input);
      assert.equal(p.isIP, wantIsIP);
      assert.equal(originPatternString(p), wantStr);
      assert.equal(canonicalizedFrom(p), wantCanonFrom);
    });
  }
});

describe('parseOriginPattern: rejects', () => {
  const cases: Array<[string, string]> = [
    ['', 'empty'],
    ['localhost', 'explicit numeric port'],
    ['localhost:', 'explicit numeric port'],
    ['localhost:abc', 'explicit numeric port'],
    ['localhost:3000/path', 'must be host:port'],
    ['localhost:3000?q=1', 'must be host:port'],
    ['localhost:3000#frag', 'must be host:port'],
    ['user:pw@localhost:3000', 'must be host:port'],
    // Mid-string '*' is not a leading legacy wildcard.
    ['foo.*.test:3000', "'*' is no longer supported"],
    ['foo*.test:3000', "'*' is no longer supported"],
    // Non-loopback hosts.
    ['example.com:443', 'loopback-class'],
    ['app.example.com:443', 'loopback-class'],
    ['app.local:80', 'loopback-class'], // .local is mDNS, not loopback
    // Non-loopback IP literals.
    ['10.0.0.1:3000', 'loopback'],
    ['192.168.1.1:3000', 'loopback'],
    ['8.8.8.8:53', 'loopback'],
  ];
  for (const [input, wantSubstr] of cases) {
    it(input, () => {
      assert.throws(
        () => parseOriginPattern(input),
        (err: Error) => err.message.includes(wantSubstr),
        `expected error containing ${JSON.stringify(wantSubstr)} for ${JSON.stringify(input)}`,
      );
    });
  }
});

describe('patternMatches', () => {
  const cases: Array<[string, string, boolean]> = [
    // DNS host: exact and subdomain matches; scheme ignored.
    ['fullstory.test:8043', 'http://fullstory.test:8043', true],
    ['fullstory.test:8043', 'https://fullstory.test:8043', true],
    ['fullstory.test:8043', 'http://www.fullstory.test:8043', true],
    ['fullstory.test:8043', 'http://foo.bar.fullstory.test:8043', true],
    ['fullstory.test:8043', 'http://fullstory.test:9000', false],
    ['fullstory.test:8043', 'http://other.test:8043', false],
    ['fullstory.test:8043', 'http://fullstory.test:8043/path', false],

    // Canonicalization: subdomain input collapses and still matches siblings.
    ['www.fullstory.test:8043', 'http://foo.fullstory.test:8043', true],

    // Localhost trunk.
    ['localhost:3000', 'http://localhost:3000', true],
    ['localhost:3000', 'http://app.localhost:3000', true],
    ['localhost:3000', 'http://localhost:4200', false],

    // app.localhost trunk: own host + its subdomains, not siblings.
    ['app.localhost:3000', 'http://app.localhost:3000', true],
    ['app.localhost:3000', 'http://x.app.localhost:3000', true],
    ['app.localhost:3000', 'http://other.localhost:3000', false],

    // IP literal: exact only.
    ['127.0.0.1:3000', 'http://127.0.0.1:3000', true],
    ['127.0.0.1:3000', 'https://127.0.0.1:3000', true],
    ['127.0.0.1:3000', 'http://127.0.0.2:3000', false],

    // IPv6 literal — origin must use brackets.
    ['[::1]:443', 'https://[::1]:443', true],
    ['[::1]:443', 'https://[::1]:444', false],

    // WebSocket schemes (ws:// / wss://) must match the same patterns as
    // http:// / https://.  The relay sends a ws:// origin for WebSocket upgrade
    // requests; a host:port that is in the allowlist must not be rejected just
    // because the scheme prefix is ws instead of http.
    ['localhost:3000', 'ws://localhost:3000', true],
    ['localhost:3000', 'wss://localhost:3000', true],
    ['fullstory.test:8043', 'ws://fullstory.test:8043', true],
    ['fullstory.test:8043', 'wss://fullstory.test:8043', true],
    ['fullstory.test:8043', 'ws://app.fullstory.test:8043', true],
    ['fullstory.test:8043', 'wss://app.fullstory.test:8043', true],
    // Port mismatch still rejected for ws/wss.
    ['localhost:3000', 'ws://localhost:4000', false],
    // Wrong host rejected.
    ['localhost:3000', 'ws://other.test:3000', false],
    // IPv4 literal with ws/wss.
    ['127.0.0.1:3000', 'ws://127.0.0.1:3000', true],
    ['127.0.0.1:3000', 'wss://127.0.0.1:3000', true],
    // IPv6 literal with wss.
    ['[::1]:443', 'wss://[::1]:443', true],
    // Scheme is case-insensitive per RFC 3986.
    ['localhost:3000', 'WS://localhost:3000', true],
    ['localhost:3000', 'WSS://localhost:3000', true],
  ];
  for (const [pattern, origin, want] of cases) {
    it(`${pattern} vs ${origin}`, () => {
      const p = parseOriginPattern(pattern);
      assert.equal(patternMatches(p, origin), want);
    });
  }
});

describe('matchesAny', () => {
  const patterns = parseOriginPatterns([
    'localhost:3000',
    'localhost:4200',
    'fullstory.test:8043',
  ]);
  it('hits exact', () => {
    assert.ok(matchesAny(patterns, 'http://localhost:3000'));
    assert.ok(matchesAny(patterns, 'http://localhost:4200'));
  });
  it('hits implicit subdomain', () => {
    assert.ok(matchesAny(patterns, 'http://app.localhost:3000'));
    assert.ok(matchesAny(patterns, 'http://foo.fullstory.test:8043'));
  });
  it('misses unmatched port and trunk', () => {
    assert.ok(!matchesAny(patterns, 'http://localhost:5000'));
    assert.ok(!matchesAny(patterns, 'http://other.test:8043'));
  });
  it('accepts ws/wss schemes', () => {
    assert.ok(matchesAny(patterns, 'ws://localhost:3000'));
    assert.ok(matchesAny(patterns, 'wss://fullstory.test:8043'));
    assert.ok(!matchesAny(patterns, 'ws://localhost:9999'));
  });
  it('empty patterns matches nothing', () => {
    assert.ok(!matchesAny([], 'http://localhost:3000'));
  });
});

describe('parseOriginPatterns', () => {
  it('returns [] for nullish', () => {
    assert.deepEqual(parseOriginPatterns(undefined), []);
    assert.deepEqual(parseOriginPatterns([]), []);
  });
  it('throws on first bad entry', () => {
    assert.throws(() => parseOriginPatterns(['localhost:3000', 'bad']));
  });
});
