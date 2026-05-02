/**
 * Allowlist parser + matcher tests. Mirrors allowlist_test.go on the Go relay
 * side — input that parses here MUST parse there too, and vice versa, so the
 * client never accepts an entry the relay would reject.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesAny,
  originPatternString,
  parseOriginPattern,
  parseOriginPatterns,
  patternMatches,
} from '../src/allowlist.js';

describe('parseOriginPattern: accepts', () => {
  const cases: Array<[string, string, boolean]> = [
    ['http://localhost:3000', 'http://localhost:3000', false],
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080', false],
    ['https://localhost:443', 'https://localhost:443', false],
    ['http://foo.test:3000', 'http://foo.test:3000', false],
    ['http://foo.localhost:3000', 'http://foo.localhost:3000', false],
    ['http://*.intercom.test:3000', 'http://*.intercom.test:3000', true],
    ['http://*.embercom.test:4200', 'http://*.embercom.test:4200', true],
    ['http://*.localhost:3000', 'http://*.localhost:3000', true],
    ['http://LOCALHOST:3000', 'http://localhost:3000', false],
    ['http://*.Foo.Test:3000', 'http://*.foo.test:3000', true],
  ];
  for (const [input, want, wantWild] of cases) {
    it(input, () => {
      const p = parseOriginPattern(input);
      assert.equal(p.wildcard, wantWild);
      assert.equal(originPatternString(p), want);
    });
  }
});

describe('parseOriginPattern: rejects', () => {
  const cases: Array<[string, string]> = [
    ['', 'empty'],
    ['http://localhost', 'explicit port required'],
    ['ftp://localhost:3000', 'scheme must be http or https'],
    ['http://localhost:3000/path', 'must not include path'],
    ['http://localhost:3000?q=1', 'must not include path'],
    ['http://localhost:3000#frag', 'must not include path'],
    ['http://user:pw@localhost:3000', 'must not include path'],
    ['http://*:3000', 'leading'],
    ['http://*foo.test:3000', 'leading'],
    ['http://foo.*.test:3000', 'leading'],
    ['http://*.com:3000', 'wildcard suffix'],
    ['http://*.io:443', 'wildcard suffix'],
    ['http://*.example.com:3000', 'wildcard suffix'],
    ['http://*.local:3000', 'wildcard suffix'],
    ['http://example.com:3000', 'host must be loopback'],
    ['http://10.0.0.1:3000', 'host must be loopback'],
    ['http://192.168.1.1:3000', 'host must be loopback'],
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
    // Exact form
    ['http://localhost:3000', 'http://localhost:3000', true],
    ['http://localhost:3000', 'http://localhost:4200', false],
    ['http://localhost:3000', 'https://localhost:3000', false],
    ['http://localhost:3000', 'http://127.0.0.1:3000', false],
    ['http://localhost:3000', 'http://LOCALHOST:3000', true],
    ['http://localhost:3000', 'http://localhost:3000/path', false],
    // Wildcard form
    ['http://*.intercom.test:3000', 'http://foo.intercom.test:3000', true],
    ['http://*.intercom.test:3000', 'http://a.b.intercom.test:3000', true],
    ['http://*.intercom.test:3000', 'http://intercom.test:3000', false],
    ['http://*.intercom.test:3000', 'http://foo.intercom.test:4200', false],
    ['http://*.intercom.test:3000', 'https://foo.intercom.test:3000', false],
    ['http://*.intercom.test:3000', 'http://foo.embercom.test:3000', false],
    ['http://*.localhost:3000', 'http://app.localhost:3000', true],
    ['http://*.localhost:3000', 'http://localhost:3000', false],
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
    'http://localhost:3000',
    'http://localhost:4200',
    'http://*.intercom.test:3000',
  ]);
  it('hits exact', () => {
    assert.ok(matchesAny(patterns, 'http://localhost:3000'));
    assert.ok(matchesAny(patterns, 'http://localhost:4200'));
  });
  it('hits wildcard', () => {
    assert.ok(matchesAny(patterns, 'http://foo.intercom.test:3000'));
  });
  it('misses unmatched port/scheme', () => {
    assert.ok(!matchesAny(patterns, 'http://localhost:5000'));
    assert.ok(!matchesAny(patterns, 'http://foo.intercom.test:4200'));
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
    assert.throws(() => parseOriginPatterns(['http://localhost:3000', 'bad']));
  });
});
