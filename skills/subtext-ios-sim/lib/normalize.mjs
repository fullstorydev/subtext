const TAG_BY_TYPE = {
  application: 'application',
  window: 'window',
  group: 'other',
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

function collapse(raw, isRoot) {
  const tag = tagFor(raw.type, raw.role, raw.subrole);
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
      label: present(raw.label),
      identifier: present(raw.identifier),
      value: present(raw.value),
      enabled: raw.enabled !== false,
      frame,
      visible: intersects(frame, screen),
      onScreen: centerOnScreen(frame, screen),
      interactive: INTERACTIVE_TAGS.has(tag),
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
  return { screen, root, nodes, byId: new Map(nodes.map((n) => [n.id, n])) };
}

const CSS_IDENT = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;

export function cssId(node) {
  return node.identifier && CSS_IDENT.test(node.identifier) ? node.identifier : null;
}

export function attrsOf(node) {
  const attrs = {};
  if (node.identifier) attrs.identifier = node.identifier;
  if (cssId(node)) attrs.id = node.identifier;
  if (node.label) attrs.text = node.label;
  if (node.value) attrs.value = node.value;
  if (!node.enabled) attrs.disabled = '';
  return attrs;
}
