export class SimError extends Error {
  constructor(code, message, hint) {
    super(message);
    this.code = code;
    this.hint = hint ?? HINTS[code] ?? null;
  }
}

const HINTS = {
  no_session: 'run `subtext-sim start --detach` first',
  daemon_unreachable: 'run `subtext-sim start --detach` to start a new session',
  device_not_found: 'list devices with `xcrun simctl list devices available`, then pass --device',
  not_booted: 'run `subtext-sim start` to boot the simulator',
  ax_disabled: 'snapshot again in a moment (a system sheet such as "Save Password?" may be animating in); if it persists, run `subtext-sim relaunch` (it re-enables app accessibility before launching)',
  ax_unavailable: 'the app may still be launching; retry, or run `subtext-sim relaunch`',
  ax_error: 'the app may not be in the foreground; run `subtext-sim launch`, or `subtext-sim relaunch`',
  hid_error: 'retry; if it keeps failing, run `subtext-sim stop` then `subtext-sim start`',
  helper_crashed: 'retry; the daemon restarts the helper automatically',
  not_found: 'run `subtext-sim snapshot` to see what is on screen',
  stale_target: 'run `subtext-sim snapshot` and act on the new ids',
  offscreen: 'scroll it into view first, e.g. `subtext-sim scroll down --until <target>`',
  covered: 'dismiss what covers it (e.g. `subtext-sim key return` for the keyboard) or scroll, then retry',
  disabled: 'the control is disabled; complete the prerequisite steps, then snapshot again',
  bad_query: 'queries look like `SignInButton`, `ProductRow[title^="Product 1"]`, `button[identifier="login-submit"]`',
  unknown_view: 'check the view names under .sightmap/',
  corpus_unavailable: 'install the sightmap CLI (`npm install -g @sightmap/sightmap`) or set SIGHTMAP_BIN',
  usage: 'run `subtext-sim help`',
};

export function toWire(err) {
  return { code: err.code ?? 'internal', message: err.message, hint: err.hint ?? HINTS[err.code] ?? null };
}

export function fromWire({ code, message, hint }) {
  return new SimError(code, message, hint ?? undefined);
}
