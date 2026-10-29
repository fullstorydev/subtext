// Stands in for subtext-sim-helper: same JSON-lines protocol, a fixed screen,
// and every input request appended to $FAKE_HELPER_LOG for assertions.
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

let email = '';
let describes = 0;
let armedAt = null;
// After `arm`, a `late` button appears on the third describe and a `mover` button slides for three describes, like a sheet closing.
const settling = () => (armedAt === null ? 0 : Math.max(0, armedAt + 3 - describes));
const node = (type, frame, extra = {}) => ({ role: `AX${type}`, type, subrole: null, traits: [], label: null, identifier: null, value: null, frame, enabled: true, children: [], ...extra });
const tree = () => ({
  screen: { w: 400, h: 800 },
  root: node('Application', { x: 0, y: 0, w: 400, h: 800 }, {
    label: 'Fake',
    children: [
      node('Button', { x: 10, y: 10, w: 100, h: 40 }, { label: 'Go', identifier: 'go' }),
      node('TextField', { x: 10, y: 60, w: 200, h: 40 }, { identifier: 'email', value: email || 'Email' }),
      node('Button', { x: 10, y: 120, w: 100, h: 40 }, { label: 'Nope', identifier: 'nope', enabled: false }),
      node('Button', { x: 10, y: 1200, w: 100, h: 40 }, { label: 'Far', identifier: 'far' }),
      node('Group', { x: 0, y: 740, w: 400, h: 60 }, { label: 'Tab Bar' }),
      node('Button', { x: 10, y: 750, w: 100, h: 40 }, { label: 'Under', identifier: 'under' }),
      ...(armedAt !== null && !settling() ? [node('Button', { x: 200, y: 10, w: 100, h: 40 }, { label: 'Late', identifier: 'late' })] : []),
      ...(armedAt !== null ? [node('Button', { x: 200, y: 300 + settling() * 40, w: 100, h: 40 }, { label: 'Mover', identifier: 'mover' })] : []),
    ],
  }),
});

createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, cmd, args } = JSON.parse(line);
  const reply = (msg) => process.stdout.write(`${JSON.stringify({ id, ...msg })}\n`);
  if (cmd === 'crash') process.exit(3);
  if (process.env.FAKE_HELPER_LOG && !['hello', 'describe', 'arm'].includes(cmd)) appendFileSync(process.env.FAKE_HELPER_LOG, `${JSON.stringify({ cmd, args })}\n`);
  switch (cmd) {
    case 'hello': return reply({ ok: true, result: { version: 'fake' } });
    case 'describe': describes++; return reply({ ok: true, result: tree() });
    case 'arm': armedAt = describes; return reply({ ok: true, result: {} });
    case 'type': email += args.text; return reply({ ok: true, result: {} });
    case 'key': if (args.key === 'delete' || args.key === 'forward_delete') email = email.slice(0, -1); return reply({ ok: true, result: {} });
    case 'tap': case 'swipe': case 'button': return reply({ ok: true, result: {} });
    default: return reply({ ok: false, error: { code: 'unknown_cmd', message: `unknown cmd '${cmd}'` } });
  }
});
