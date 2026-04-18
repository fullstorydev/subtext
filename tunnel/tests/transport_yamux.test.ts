/**
 * Unit tests for transport_yamux wire-format helpers.
 *
 * frameJson and the stream-type/connect-status constants are tested in
 * isolation — no WebSocket, no network. The goal is to catch regressions
 * in the binary framing without needing a full end-to-end tunnel.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  frameJson,
  streamingResponseFrame,
  bufferedResponseFrame,
  STREAM_TYPE_REQUEST,
  STREAM_TYPE_CONNECT,
  CONNECT_STATUS_OK,
  CONNECT_STATUS_ERR,
} from '../src/transport_yamux.js';

describe('constants', () => {
  it('stream type bytes match relay expectations', () => {
    assert.equal(STREAM_TYPE_REQUEST, 0x01);
    assert.equal(STREAM_TYPE_CONNECT, 0x02);
  });

  it('connect status bytes match relay expectations', () => {
    assert.equal(CONNECT_STATUS_OK, 0x00);
    assert.equal(CONNECT_STATUS_ERR, 0x01);
  });
});

describe('frameJson', () => {
  it('header only: [4-byte len][hdr]', () => {
    const hdr = Buffer.from('{"status":200,"headers":{}}');
    const frame = frameJson(hdr);

    // First 4 bytes are big-endian length of the JSON.
    assert.equal(frame.readUInt32BE(0), hdr.length);
    // Remaining bytes are the JSON itself.
    assert.deepEqual(frame.subarray(4), hdr);
    assert.equal(frame.length, 4 + hdr.length);
  });

  it('header + body: [4-byte len][hdr][body]', () => {
    const hdr = Buffer.from('{"status":200,"headers":{},"bodyLen":5}');
    const body = Buffer.from('hello');
    const frame = frameJson(hdr, body);

    assert.equal(frame.readUInt32BE(0), hdr.length);
    assert.deepEqual(frame.subarray(4, 4 + hdr.length), hdr);
    assert.deepEqual(frame.subarray(4 + hdr.length), body);
    assert.equal(frame.length, 4 + hdr.length + body.length);
  });

  it('empty body is treated same as no body', () => {
    const hdr = Buffer.from('{}');
    assert.deepEqual(frameJson(hdr, Buffer.alloc(0)), frameJson(hdr));
  });

  it('length prefix is big-endian', () => {
    // 256 = 0x00_00_01_00 in big-endian
    const hdr = Buffer.alloc(256);
    const frame = frameJson(hdr);
    assert.equal(frame[0], 0x00);
    assert.equal(frame[1], 0x00);
    assert.equal(frame[2], 0x01);
    assert.equal(frame[3], 0x00);
  });

  it('large body does not corrupt header boundary', () => {
    const hdr = Buffer.from('{"status":200,"headers":{}}');
    const body = Buffer.alloc(1024, 0xab);
    const frame = frameJson(hdr, body);

    const parsedLen = frame.readUInt32BE(0);
    assert.equal(parsedLen, hdr.length);
    // Body starts immediately after the header.
    const bodyStart = 4 + hdr.length;
    assert.equal(frame[bodyStart], 0xab);
    assert.equal(frame[frame.length - 1], 0xab);
  });
});

describe('streamingResponseFrame', () => {
  it('omits bodyLen, contains status and headers', () => {
    const frame = streamingResponseFrame(200, {'content-type': ['text/html']});
    const len = frame.readUInt32BE(0);
    const hdr = JSON.parse(frame.subarray(4, 4 + len).toString());
    assert.equal(hdr.status, 200);
    assert.deepEqual(hdr.headers, {'content-type': ['text/html']});
    assert.equal(hdr.bodyLen, undefined);
    assert.equal(frame.length, 4 + len); // no body bytes appended
  });
});

describe('bufferedResponseFrame', () => {
  it('includes bodyLen and appends body bytes', () => {
    const body = Buffer.from('hello');
    const frame = bufferedResponseFrame(404, {}, body);
    const len = frame.readUInt32BE(0);
    const hdr = JSON.parse(frame.subarray(4, 4 + len).toString());
    assert.equal(hdr.status, 404);
    assert.equal(hdr.bodyLen, 5);
    assert.deepEqual(frame.subarray(4 + len), body);
  });

  it('empty body sets bodyLen to 0', () => {
    const frame = bufferedResponseFrame(204, {}, Buffer.alloc(0));
    const len = frame.readUInt32BE(0);
    const hdr = JSON.parse(frame.subarray(4, 4 + len).toString());
    assert.equal(hdr.bodyLen, 0);
    assert.equal(frame.length, 4 + len);
  });
});
