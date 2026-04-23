import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildEmbedSrc, parseTraceUrl, InvalidTraceUrlError } from '../src/url.js';

test('parseTraceUrl extracts appHost, orgId, traceId', () => {
  const parts = parseTraceUrl('https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz12345');
  assert.equal(parts.appHost, 'https://app.fullstory.com');
  assert.equal(parts.orgId, 'o-ABC');
  assert.equal(parts.traceId, 'tr-xyz12345');
});

test('parseTraceUrl handles ports and deep URLs', () => {
  const parts = parseTraceUrl(
    'https://app.fullstory.test:8043/subtext/local/trace/c4b5b8102a9e',
  );
  assert.equal(parts.appHost, 'https://app.fullstory.test:8043');
  assert.equal(parts.orgId, 'local');
  assert.equal(parts.traceId, 'c4b5b8102a9e');
});

test('parseTraceUrl ignores query + hash when present', () => {
  const parts = parseTraceUrl(
    'https://app.fullstory.com/subtext/o/trace/t?foo=bar#baz',
  );
  assert.equal(parts.orgId, 'o');
  assert.equal(parts.traceId, 't');
});

test('parseTraceUrl throws on non-URLs', () => {
  assert.throws(() => parseTraceUrl('not a url'), InvalidTraceUrlError);
});

test('parseTraceUrl throws on paths missing /trace/ segment', () => {
  assert.throws(
    () => parseTraceUrl('https://app.fullstory.com/subtext/o-ABC'),
    InvalidTraceUrlError,
  );
});

test('parseTraceUrl throws when /trace/ is first segment (no orgId preceding it)', () => {
  assert.throws(
    () => parseTraceUrl('https://app.fullstory.com/trace/t'),
    InvalidTraceUrlError,
  );
});

test('buildEmbedSrc includes token as raw fragment (no URL-encoding of + or /)', () => {
  const parts = parseTraceUrl('https://app.fullstory.com/subtext/o/trace/t');
  // Base64-like token with characters that URL-encoders mangle.
  const token = 'na1.ss!ss-wb:XCAS+Gj/abc:r/UEG/4+66f9';
  const src = buildEmbedSrc(parts, token);
  assert.equal(
    src,
    `https://app.fullstory.com/subtext/o/trace/t/embed?embed=true#token=${token}`,
  );
});

test('buildEmbedSrc omits hash when no token provided', () => {
  const parts = parseTraceUrl('https://app.fullstory.com/subtext/o/trace/t');
  const src = buildEmbedSrc(parts, null);
  assert.equal(src, 'https://app.fullstory.com/subtext/o/trace/t/embed?embed=true');
  assert.ok(!src.includes('#'));
});

test('buildEmbedSrc passes through ID segments verbatim on the happy path', () => {
  // Org / trace IDs in practice are URL-safe (e.g. "o-ABC", "tr-xyz").
  // The CLI's embed-token command emits them unencoded; we match.
  const parts = parseTraceUrl('https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz');
  const src = buildEmbedSrc(parts, null);
  assert.equal(src, 'https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz/embed?embed=true');
});
