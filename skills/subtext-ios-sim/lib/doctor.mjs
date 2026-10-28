import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const HELPER_BUILD = join(SKILL_DIR, 'helper', 'build.sh');
const SIGHTMAP_PACKAGE = '@sightmap/sightmap@0.32.0';
const MIN_XCODE = 26;
const MIN_MACOS = 15;
const MIN_NODE = 18;
const XCODE_DOWNLOAD = 'Install Xcode 26 or later from the Mac App Store or https://developer.apple.com/download/applications/, open it once, then re-run doctor';

function run(cmd, args, { timeout = 60_000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ ok: !error, code: error?.code ?? 0, stdout: String(stdout).trim(), stderr: String(stderr).trim() });
    });
  });
}

const majorOf = (version) => Number.parseInt(String(version).split('.')[0], 10);
const pass = (name, detail) => ({ name, ok: true, detail, fix: null });
const fail = (name, detail, fix, autoFix) => ({ name, ok: false, detail, fix, autoFix });

async function checkXcodeSelect() {
  const r = await run('xcode-select', ['-p']);
  if (!r.ok) return fail('xcode-select', 'xcode-select -p failed: no developer directory', 'xcode-select --install, then ' + XCODE_DOWNLOAD);
  if (!/\.app\/Contents\/Developer$/.test(r.stdout)) {
    const xcodes = (await run('/bin/sh', ['-c', 'ls -d /Applications/Xcode*.app 2>/dev/null'])).stdout.split('\n').filter(Boolean);
    const fix = xcodes.length
      ? `sudo xcode-select -s ${xcodes.at(-1)}/Contents/Developer`
      : XCODE_DOWNLOAD + ', then sudo xcode-select -s /Applications/Xcode.app/Contents/Developer';
    return fail('xcode-select', `points at ${r.stdout} (Command Line Tools), not an Xcode.app`, fix);
  }
  return pass('xcode-select', r.stdout);
}

async function checkXcodeVersion() {
  const r = await run('xcodebuild', ['-version']);
  const version = r.stdout.match(/^Xcode (\S+)/m)?.[1];
  if (!r.ok || !version) return fail('xcode-version', `xcodebuild -version failed: ${r.stderr || r.stdout}`, XCODE_DOWNLOAD);
  if (majorOf(version) < MIN_XCODE) return fail('xcode-version', `Xcode ${version}; need ${MIN_XCODE}+`, XCODE_DOWNLOAD);
  const firstLaunch = await run('xcodebuild', ['-checkFirstLaunchStatus']);
  if (!firstLaunch.ok) return fail('xcode-version', `Xcode ${version}, but first-launch setup is incomplete`, 'sudo xcodebuild -runFirstLaunch');
  return pass('xcode-version', `Xcode ${version}`);
}

async function checkSimulators() {
  const runtimes = await run('xcrun', ['simctl', 'list', 'runtimes', '-j']);
  if (!runtimes.ok) return [fail('simctl', `xcrun simctl failed: ${runtimes.stderr}`, 'Fix xcode-select first, then: sudo xcodebuild -runFirstLaunch')];
  const ios = JSON.parse(runtimes.stdout).runtimes.filter((rt) => rt.platform === 'iOS' && rt.isAvailable);
  if (!ios.length) {
    return [fail('ios-runtime', 'no available iOS Simulator runtime', 'xcodebuild -downloadPlatform iOS', ['xcodebuild', ['-downloadPlatform', 'iOS']])];
  }
  const newest = ios.at(-1);
  const checks = [pass('ios-runtime', ios.map((rt) => `iOS ${rt.version}`).join(', '))];

  const devices = JSON.parse((await run('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])).stdout).devices;
  const iosDevices = ios.flatMap((rt) => devices[rt.identifier] ?? []);
  if (iosDevices.length) {
    const booted = iosDevices.filter((d) => d.state === 'Booted').map((d) => d.name);
    checks.push(pass('ios-device', `${iosDevices.length} iOS simulators${booted.length ? `; booted: ${booted.join(', ')}` : ''}`));
  } else {
    const type = newest.supportedDeviceTypes.filter((t) => t.productFamily === 'iPhone').at(0);
    const args = ['simctl', 'create', type?.name ?? 'iPhone', type?.identifier ?? '<device type>', newest.identifier];
    checks.push(fail('ios-device', `no simulator devices for iOS ${newest.version}`, `xcrun ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`, type && ['xcrun', args]));
  }
  return checks;
}

async function checkSwift() {
  const r = await run('swift', ['--version']);
  const line = (r.stdout || r.stderr).split('\n').find((l) => /Swift version/.test(l));
  if (!r.ok || !line) return fail('swift', 'swift --version failed', 'Fix xcode-select first; swift ships with Xcode');
  return pass('swift', line.trim());
}

async function checkArch() {
  const r = await run('sysctl', ['-n', 'hw.optional.arm64']);
  if (r.stdout !== '1') return fail('apple-silicon', `this Mac is ${process.arch}`, 'An Apple Silicon (arm64) Mac is required; the simulator helper ships arm64-only frameworks');
  return pass('apple-silicon', 'arm64');
}

async function checkMacOS() {
  const r = await run('sw_vers', ['-productVersion']);
  if (majorOf(r.stdout) < MIN_MACOS) return fail('macos', `macOS ${r.stdout}; need ${MIN_MACOS}+`, `Update to macOS ${MIN_MACOS} or later (System Settings > General > Software Update)`);
  return pass('macos', `macOS ${r.stdout}`);
}

async function checkNode() {
  const version = process.versions.node;
  if (majorOf(version) < MIN_NODE) return fail('node', `Node ${version}; need ${MIN_NODE}+`, 'brew install node (or nvm install --lts)');
  return pass('node', `Node ${version}`);
}

async function checkSightmap() {
  const onPath = await run('sightmap', ['version']);
  if (onPath.ok) return pass('sightmap', `${onPath.stdout} (on PATH)`);
  const viaNpx = await run('npx', ['-y', SIGHTMAP_PACKAGE, 'version'], { timeout: 180_000 });
  if (viaNpx.ok) return pass('sightmap', `${viaNpx.stdout} (via npx ${SIGHTMAP_PACKAGE})`);
  return fail('sightmap', `sightmap not on PATH and npx ${SIGHTMAP_PACKAGE} failed: ${viaNpx.stderr.split('\n').at(-1)}`, `npm install -g ${SIGHTMAP_PACKAGE}`, ['npm', ['install', '-g', SIGHTMAP_PACKAGE]]);
}

async function checkHelper() {
  if (!existsSync(HELPER_BUILD)) return { name: 'helper', ok: null, detail: `pending: ${HELPER_BUILD} not present yet`, fix: null };
  const r = await run('bash', [HELPER_BUILD], { timeout: 15 * 60_000 });
  if (!r.ok) {
    const tail = (r.stderr || r.stdout).split('\n').slice(-5).join('\n');
    return fail('helper', `helper build failed:\n${tail}`, `bash ${HELPER_BUILD}  (fix the errors above; a newer Xcode may need a helper update)`);
  }
  return pass('helper', r.stdout.split('\n').at(-1) || 'built');
}

const ICON = { true: 'ok  ', false: 'FAIL', null: 'PEND' };

function report(checks) {
  const width = Math.max(...checks.map((c) => c.name.length));
  const lines = checks.map((c) => {
    const head = `[${ICON[c.ok]}] ${c.name.padEnd(width)}  ${c.detail}`;
    return c.fix ? `${head}\n       ${' '.repeat(width)}  fix: ${c.fix}` : head;
  });
  const failed = checks.filter((c) => c.ok === false).length;
  const pending = checks.filter((c) => c.ok === null).length;
  lines.push('', failed ? `${failed} check(s) failed.` : `All checks passed${pending ? ` (${pending} pending)` : ''}.`);
  console.log(lines.join('\n'));
}

async function runChecks() {
  const prerequisites = await Promise.all([checkXcodeSelect(), checkXcodeVersion(), checkSimulators(), checkSwift(), checkArch(), checkMacOS(), checkNode(), checkSightmap()]);
  return [...prerequisites.flat(), await checkHelper()];
}

/** Runs every check, prints a report, and returns `[{name, ok, detail, fix}]` (`ok: null` means pending). With `fix`, runs the unprivileged fixes once and re-checks. */
export async function doctor({ fix = false } = {}) {
  let checks = await runChecks();
  const fixable = checks.filter((c) => c.ok === false && c.autoFix);
  if (fix && fixable.length) {
    for (const c of fixable) {
      const [cmd, args] = c.autoFix;
      console.log(`fixing ${c.name}: ${cmd} ${args.join(' ')}`);
      await run(cmd, args, { timeout: 60 * 60_000 });
    }
    checks = await runChecks();
  }
  checks = checks.map(({ autoFix, ...c }) => c);
  report(checks);
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const checks = await doctor({ fix: process.argv.includes('--fix') });
  process.exitCode = checks.some((c) => c.ok === false) ? 1 : 0;
}
