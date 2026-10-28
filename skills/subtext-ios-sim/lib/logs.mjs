import { spawn } from 'node:child_process';
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';

const LEVEL_BY_TYPE = { Default: 'default', Info: 'info', Debug: 'debug', Error: 'error', Fault: 'fault' };

export const LEVELS = ['debug', 'info', 'default', 'error', 'fault', 'stdout', 'stderr'];

/** Parses one `log stream --style ndjson` line into a console entry, or null for non-log events. */
export function parseLogLine(line) {
  if (!line.startsWith('{')) return null;
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return null;
  }
  if (j.eventType !== 'logEvent' || typeof j.eventMessage !== 'string') return null;
  return {
    time: j.timestamp ?? null,
    level: LEVEL_BY_TYPE[j.messageType] ?? String(j.messageType ?? 'default').toLowerCase(),
    source: 'os_log',
    subsystem: j.subsystem || null,
    category: j.category || null,
    message: j.eventMessage,
  };
}

const SESSION_URL = [/FULLSTORY_SESSION_URL\s+(\S+)/, /Beginning session:?\s*(https?:\/\/\S+)/i];

export function sessionUrlIn(message) {
  for (const re of SESSION_URL) {
    const m = re.exec(message);
    if (m) return m[1];
  }
  return null;
}

/** A bounded console buffer with stable, ever-increasing indexes. */
export class ConsoleBuffer {
  constructor(capacity = 5000) {
    this.capacity = capacity;
    this.entries = [];
    this.nextIndex = 0;
    this.sessionUrl = null;
  }

  push(entry) {
    const full = { index: this.nextIndex++, ...entry, time: entry.time ?? new Date().toISOString() };
    this.entries.push(full);
    if (this.entries.length > this.capacity) this.entries.shift();
    const url = sessionUrlIn(full.message);
    if (url && url !== this.sessionUrl) {
      this.sessionUrl = url;
      this.onSessionUrl?.(url);
    }
    return full;
  }

  list({ limit = 50, grep, level } = {}) {
    const levels = level ? new Set(String(level).split(',').map((l) => l.trim().toLowerCase())) : null;
    const needle = grep ? String(grep).toLowerCase() : null;
    const hits = this.entries.filter((e) =>
      (!levels || levels.has(e.level)) && (!needle || e.message.toLowerCase().includes(needle)
        || (e.subsystem ?? '').toLowerCase().includes(needle)));
    return { total: hits.length, entries: limit > 0 ? hits.slice(-limit) : hits };
  }

  get(index) {
    return this.entries.find((e) => e.index === index) ?? null;
  }
}

/** Follows a file that another process appends to (the app's redirected stdout/stderr). */
class FileTail {
  constructor(path, onLine) {
    this.path = path;
    this.onLine = onLine;
    this.offset = 0;
    this.partial = '';
    this.timer = setInterval(() => this.poll(), 200);
    this.timer.unref?.();
  }

  poll() {
    let size;
    try {
      size = statSync(this.path).size;
    } catch {
      return;
    }
    if (size < this.offset) this.offset = 0;
    if (size === this.offset) return;
    const fd = openSync(this.path, 'r');
    try {
      const buf = Buffer.alloc(size - this.offset);
      readSync(fd, buf, 0, buf.length, this.offset);
      this.offset = size;
      const lines = (this.partial + buf.toString('utf8')).split('\n');
      this.partial = lines.pop();
      for (const line of lines) if (line.trim()) this.onLine(line);
    } finally {
      closeSync(fd);
    }
  }

  close() {
    this.poll();
    clearInterval(this.timer);
  }
}

/**
 * Collects the app's console: os_log / Logger output from `log stream` (the
 * app's process, minus Apple frameworks' info and default chatter) plus its
 * redirected stdout and stderr.
 */
export class LogCollector {
  constructor({ udid, processName, stdoutPath, stderrPath, buffer = new ConsoleBuffer(), log = () => {} }) {
    Object.assign(this, { udid, processName, stdoutPath, stderrPath, buffer, log });
    this.proc = null;
    this.tails = [];
    this.closed = false;
  }

  start() {
    this.startStream();
    this.tails = [
      new FileTail(this.stdoutPath, (message) => this.buffer.push({ level: 'stdout', source: 'stdout', subsystem: null, category: null, message })),
      new FileTail(this.stderrPath, (message) => this.buffer.push({ level: 'stderr', source: 'stderr', subsystem: null, category: null, message })),
    ];
  }

  startStream() {
    if (this.closed) return;
    const predicate = `process == ${JSON.stringify(this.processName)} AND (NOT (subsystem BEGINSWITH "com.apple.") OR messageType == error OR messageType == fault)`;
    const proc = spawn('xcrun', ['simctl', 'spawn', this.udid, 'log', 'stream', '--style', 'ndjson', '--level', 'info', '--predicate', predicate], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.proc = proc;
    createInterface({ input: proc.stdout }).on('line', (line) => {
      const entry = parseLogLine(line);
      if (entry) this.buffer.push(entry);
    });
    proc.on('exit', (code) => {
      if (this.proc !== proc) return;
      this.proc = null;
      if (!this.closed) {
        this.log(`log stream exited (${code}); restarting in 1 s`);
        setTimeout(() => this.startStream(), 1000).unref?.();
      }
    });
  }

  get streaming() {
    return !!this.proc;
  }

  close() {
    this.closed = true;
    this.proc?.kill();
    this.proc = null;
    for (const t of this.tails) t.close();
  }
}
