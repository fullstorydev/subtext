const TAG_BY_TYPE = {
  application: 'application',
  window: 'window',
  group: 'other',
  genericelement: 'other',
  other: 'other',
  button: 'button',
  statictext: 'text',
  text: 'text',
  textfield: 'textfield',
  securetextfield: 'securetextfield',
  searchfield: 'searchfield',
  textview: 'textview',
  textarea: 'textview',
  image: 'image',
  icon: 'image',
  cell: 'cell',
  table: 'table',
  collectionview: 'collection',
  scrollarea: 'scrollview',
  scrollview: 'scrollview',
  heading: 'heading',
  link: 'link',
  checkbox: 'checkbox',
  switch: 'switch',
  toggle: 'switch',
  radiobutton: 'radio',
  slider: 'slider',
  stepper: 'stepper',
  incrementor: 'stepper',
  segmentedcontrol: 'segmentedcontrol',
  picker: 'picker',
  pickerwheel: 'pickerwheel',
  popupbutton: 'popup',
  menu: 'menu',
  menuitem: 'menuitem',
  navigationbar: 'navbar',
  tabbar: 'tabbar',
  toolbar: 'toolbar',
  alert: 'alert',
  sheet: 'sheet',
  keyboard: 'keyboard',
  key: 'key',
  progressindicator: 'progress',
  activityindicator: 'progress',
  webview: 'webview',
};

const TAG_BY_SUBROLE = {
  AXSwitch: 'switch',
  AXTabButton: 'tab',
  AXSearchField: 'searchfield',
  AXSecureTextField: 'securetextfield',
};

const INTERACTIVE_TAGS = new Set([
  'button', 'link', 'cell', 'textfield', 'securetextfield', 'searchfield', 'textview',
  'checkbox', 'switch', 'radio', 'tab', 'slider', 'stepper', 'segmentedcontrol',
  'picker', 'pickerwheel', 'popup', 'menuitem', 'key',
]);

const MAX_TEXT = 300;

export function tagFor(type, role, subrole) {
  if (subrole && TAG_BY_SUBROLE[subrole]) return TAG_BY_SUBROLE[subrole];
  const raw = String(type || role || 'other').replace(/^XCUIElementType/, '').replace(/^AX/, '');
  const key = raw.toLowerCase();
  return TAG_BY_TYPE[key] ?? key;
}

const present = (s) => (typeof s === 'string' && s !== '' ? s : null);

function isWrapper(raw, tag) {
  return tag === 'other' && !present(raw.label) && !present(raw.identifier) && !present(raw.value);
}

// React Native reports accessibilityRole="tab" (React Navigation's tab buttons)
// as a button whose label carries VoiceOver's "tab, N of M" suffix.
const RN_TAB_LABEL = /^(.*), tab, \d+ of \d+$/;

function rnTabTitle(raw) {
  return typeof raw.label === 'string' ? RN_TAB_LABEL.exec(raw.label)?.[1] ?? null : null;
}

// React Native's accessible Views (role-less Pressables included) are
// GenericElements; with a testID they are as likely to be tappable as not.
function isIdentifiedGeneric(raw) {
  const type = String(raw.type || raw.role || '').replace(/^AX/, '').toLowerCase();
  return type === 'genericelement' && !!present(raw.identifier);
}

// The system keyboard's window: its container, its keys, and anything carrying
// the KeyboardKey trait. Not part of the app, so not in coverage or components.
function isKeyboard(raw, tag) {
  return tag === 'keyboard' || tag === 'key' || (raw.traits ?? []).includes('KeyboardKey');
}

const TAPPABLE_TRAITS = new Set(['Button', 'Link', 'Adjustable']);

// A labelled or identified `other` whose traits say it can be tapped: React
// Native Pressables surface as `other`, and an accessibilityRole adds the trait.
function isTappableOther(raw, tag) {
  return tag === 'other' && (raw.traits ?? []).some((t) => TAPPABLE_TRAITS.has(t)) && !!(present(raw.label) || present(raw.identifier));
}

function collapse(raw, isRoot) {
  const tag = rnTabTitle(raw) !== null ? 'tab' : tagFor(raw.type, raw.role, raw.subrole);
  let children = (raw.children ?? []).flatMap((c) => collapse(c, false));
  if (!isRoot && isWrapper(raw, tag)) {
    if (children.length <= 1) return children;
  }
  return [{ raw, tag, children }];
}

function intersects(f, screen) {
  return f.w > 0 && f.h > 0 && f.x < screen.w && f.y < screen.h && f.x + f.w > 0 && f.y + f.h > 0;
}

function centerOnScreen(f, screen) {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  return f.w > 0 && f.h > 0 && cx >= 0 && cy >= 0 && cx <= screen.w && cy <= screen.h;
}

function frameOf(raw) {
  const f = raw.frame ?? {};
  return { x: f.x ?? 0, y: f.y ?? 0, w: f.w ?? f.width ?? 0, h: f.h ?? f.height ?? 0 };
}

export function normalize(describeResult) {
  const rawRoot = describeResult.root;
  const rootFrame = frameOf(rawRoot);
  const screen = {
    w: describeResult.screen?.w || rootFrame.w,
    h: describeResult.screen?.h || rootFrame.h,
  };
  const nodes = [];
  const build = ({ raw, tag, children }, parent, nthChild) => {
    const frame = frameOf(raw);
    const node = {
      id: nodes.length + 1,
      tag,
      type: raw.type ?? null,
      role: raw.role ?? null,
      label: present(rnTabTitle(raw) ?? raw.label),
      identifier: present(raw.identifier),
      value: present(raw.value),
      enabled: raw.enabled !== false,
      traits: Array.isArray(raw.traits) ? raw.traits : [],
      frame,
      visible: intersects(frame, screen),
      onScreen: centerOnScreen(frame, screen),
      interactive: INTERACTIVE_TAGS.has(tag) || isIdentifiedGeneric(raw) || isTappableOther(raw, tag),
      system: isKeyboard(raw, tag) || !!parent?.system,
      ignored: isWrapper(raw, tag),
      nthChild,
      text: '',
      children: [],
    };
    Object.defineProperty(node, 'parent', { value: parent, enumerable: false, writable: true });
    nodes.push(node);
    node.children = children.map((c, i) => build(c, node, i + 1));
    node.text = node.label ?? node.children.map((c) => c.text).filter(Boolean).join(' ').slice(0, MAX_TEXT);
    return node;
  };
  const [top] = collapse(rawRoot, true);
  const root = build(top, null, 1);
  return { screen, root, nodes, byId: new Map(nodes.map((n) => [n.id, n])), overlay: !!describeResult.overlay };
}

// A React Native LogBox toast (Debug builds) is one accessible element labeled
// with its icon or count first; its ✕ has no element of its own.
const LOGBOX_LABEL = /^(!|\d+), /;

/** The LogBox toast at the bottom of the screen and the point of its ✕, or null. */
export function logBoxToast({ nodes, screen }) {
  const toast = nodes.find((n) => n.tag === 'other' && !n.identifier && n.visible && n.frame.y > screen.h / 2
    && LOGBOX_LABEL.test(n.label ?? ''));
  if (!toast) return null;
  const { x, y, w, h } = toast.frame;
  return { node: toast, dismiss: { x: Math.round(x + w - 24), y: Math.round(y + h / 2) } };
}

/**
 * When everything visible fits in a small box (e.g. only the React Native / Expo
 * dev-menu button, which lives in a separate window), the app's own window is
 * most likely hidden from accessibility. Returns the visible nodes, or null.
 */
export function floatingOnly({ nodes, root, screen, overlay }) {
  if (overlay) return null;
  const shown = nodes.filter((n) => n !== root && n.visible && n.tag !== 'window' && !n.ignored);
  if (!shown.length) return null;
  const x0 = Math.min(...shown.map((n) => n.frame.x));
  const y0 = Math.min(...shown.map((n) => n.frame.y));
  const x1 = Math.max(...shown.map((n) => n.frame.x + n.frame.w));
  const y1 = Math.max(...shown.map((n) => n.frame.y + n.frame.h));
  return (x1 - x0) * (y1 - y0) < 0.1 * screen.w * screen.h ? shown : null;
}

const DEV_MENU_LABEL = /\b(dev(eloper)?[\s-]?menu|dev[\s-]?tools)\b/i;
/** How far beyond its frame a floating button still catches taps, in points. */
export const FLOATING_MARGIN = 24;

function fabShaped({ frame: { w, h }, children, identifier }) {
  return !children.length && !identifier && w >= 32 && h >= 32 && w <= 96 && h <= 96 && w / h >= 0.6 && w / h <= 1.67;
}

/**
 * Controls that most likely float in a separate small window above the app,
 * like the React Native / Expo dev-menu button. `describe` reports no windows,
 * so this is a heuristic: a dev-menu label or identifier, or a small square
 * element without an identifier drawn last at the root, as a window above the
 * app's own would be.
 */
export function floatingControls({ root, nodes }) {
  const top = root.children.filter((n) => n.visible);
  const last = top.length > 1 ? top.at(-1) : null;
  return nodes.filter((n) => n !== root && n.visible
    && (DEV_MENU_LABEL.test(n.label ?? '') || DEV_MENU_LABEL.test(n.identifier ?? '') || (n === last && fabShaped(n))));
}

const CSS_IDENT = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;

export function cssId(node) {
  return node.identifier && CSS_IDENT.test(node.identifier) ? node.identifier : null;
}

// Web and React Native session corpora select on `testid`; in the simulator the
// same testID arrives as the accessibility identifier.
export function attrsOf(node) {
  const attrs = {};
  if (node.identifier) {
    attrs.identifier = node.identifier;
    attrs.testid = node.identifier;
  }
  if (cssId(node)) attrs.id = node.identifier;
  if (node.label) attrs.text = node.label;
  if (node.value) attrs.value = node.value;
  if (!node.enabled) attrs.disabled = '';
  return attrs;
}
