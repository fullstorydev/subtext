import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SimError } from './errors.mjs';

export function xcrun(args, { timeout = 120_000, env } = {}) {
  return new Promise((resolve, reject) => {
    execFile('xcrun', args, { timeout, maxBuffer: 64 * 1024 * 1024, env: env ? { ...process.env, ...env } : process.env }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message).trim().split('\n').filter(Boolean).at(-1) ?? error.message;
        reject(new SimError('simctl_failed', `xcrun ${args.slice(0, 2).join(' ')} failed: ${detail}`));
      } else resolve(String(stdout));
    });
  });
}

export async function listDevices() {
  const { devices } = JSON.parse(await xcrun(['simctl', 'list', 'devices', 'available', '-j']));
  return Object.entries(devices)
    .filter(([runtime]) => /SimRuntime\.iOS-/.test(runtime))
    .flatMap(([runtime, list]) => list.map((d) => ({ ...d, runtime, runtimeVersion: runtime.split('iOS-')[1].replace(/-/g, '.') })));
}

const versionKey = (v) => v.split('.').map((n) => n.padStart(4, '0')).join('.');

/** Picks a device by UDID or name; without one, a booted iOS device, else the newest-runtime iPhone. */
export function pickDevice(devices, wanted) {
  if (wanted) {
    const byUdid = devices.find((d) => d.udid.toLowerCase() === wanted.toLowerCase());
    if (byUdid) return byUdid;
    const byName = devices.filter((d) => d.name === wanted)
      .sort((a, b) => (b.state === 'Booted') - (a.state === 'Booted') || versionKey(b.runtimeVersion).localeCompare(versionKey(a.runtimeVersion)));
    if (byName.length) return byName[0];
    throw new SimError('device_not_found', `no available iOS simulator named or with UDID "${wanted}"`, 'list them with `xcrun simctl list devices available`');
  }
  const booted = devices.find((d) => d.state === 'Booted');
  if (booted) return booted;
  const iphones = devices.filter((d) => d.name.startsWith('iPhone'))
    .sort((a, b) => versionKey(b.runtimeVersion).localeCompare(versionKey(a.runtimeVersion)));
  if (!iphones.length) throw new SimError('device_not_found', 'no available iOS simulator', 'run `subtext-sim doctor` for the fix');
  return iphones[0];
}

export async function boot(udid) {
  await xcrun(['simctl', 'boot', udid]).catch((err) => {
    if (!/current state: Booted/i.test(err.message)) throw err;
  });
  await xcrun(['simctl', 'bootstatus', udid], { timeout: 300_000 });
}

export const shutdown = (udid) => xcrun(['simctl', 'shutdown', udid]).catch(() => {});

export async function accessibilityEnabled(udid) {
  const out = await xcrun(['simctl', 'spawn', udid, 'defaults', 'read', 'com.apple.Accessibility', 'ApplicationAccessibilityEnabled']).catch(() => '0');
  return out.trim() === '1';
}

export const enableAccessibility = (udid) =>
  xcrun(['simctl', 'spawn', udid, 'defaults', 'write', 'com.apple.Accessibility', 'ApplicationAccessibilityEnabled', '-bool', 'true']);

export const install = (udid, appPath) => xcrun(['simctl', 'install', udid, appPath], { timeout: 300_000 });

/** Launches with stdout/stderr redirected to files; NSUnbufferedIO keeps `print` output from sitting in a buffer. */
export async function launch(udid, bundleId, { stdout, stderr, terminate = true } = {}) {
  const args = ['simctl', 'launch'];
  if (terminate) args.push('--terminate-running-process');
  if (stdout) args.push(`--stdout=${stdout}`);
  if (stderr) args.push(`--stderr=${stderr}`);
  const out = await xcrun([...args, udid, bundleId], { env: { SIMCTL_CHILD_NSUnbufferedIO: 'YES' } });
  const pid = Number(out.trim().split(':').at(-1));
  return Number.isFinite(pid) ? pid : null;
}

export const terminate = (udid, bundleId) => xcrun(['simctl', 'terminate', udid, bundleId]).catch(() => {});
export const openUrl = (udid, url) => xcrun(['simctl', 'openurl', udid, url]);
export const screenshot = (udid, path) => xcrun(['simctl', 'io', udid, 'screenshot', path]);

export async function appContainer(udid, bundleId) {
  try {
    return (await xcrun(['simctl', 'get_app_container', udid, bundleId, 'app'])).trim();
  } catch {
    throw new SimError('app_not_installed', `${bundleId} is not installed on this simulator`, 'pass --app path/to/MyApp.app to install it');
  }
}

export function plistValue(appPath, key) {
  const plist = join(appPath, 'Info.plist');
  if (!existsSync(plist)) throw new SimError('bad_app', `${appPath} has no Info.plist; pass the .app bundle built for the simulator`);
  return new Promise((resolve, reject) => {
    execFile('plutil', ['-extract', key, 'raw', '-o', '-', plist], (error, stdout) => {
      if (error) reject(new SimError('bad_app', `${plist} has no ${key}`));
      else resolve(String(stdout).trim());
    });
  });
}
