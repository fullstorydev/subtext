import {
  EmbedHostChannel,
  type EmbedHostChannelOptions,
  type RefreshAuthTokenFunc,
} from './channel.js';
import type { EmbedMode, EmbedErrorCode } from './protocol.js';
import { buildEmbedSrc, parseTraceUrl } from './url.js';

export interface SubtextEmbedOptions {
  // Where to mount the iframe. Accepts an element or a CSS selector.
  parentElement: HTMLElement | string;

  // Canonical trace URL, e.g. https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz
  traceUrl: string;

  // Called to mint the initial token and refresh subsequent ones. Return
  // either a string (token only) or {token, expiresAt} (enables iframe
  // to schedule proactive refreshes at expiresAt - 60s).
  refreshAuthToken: RefreshAuthTokenFunc;

  onReady?: () => void;
  onError?: (err: { code: EmbedErrorCode; message?: string }) => void;
  onModeChanged?: (mode: EmbedMode) => void;

  // Iframe sizing. Numbers are px; strings pass through (e.g. "100%").
  width?: number | string;
  height?: number | string;

  // Extra attributes for the iframe element.
  iframeAttributes?: Record<string, string>;
}

// Handle returned from SubtextEmbed.render — used to tear down the iframe
// and channel when the caller is done with it.
export interface SubtextEmbedHandle {
  iframe: HTMLIFrameElement;
  destroy: () => void;
}

// Create the embed iframe and wire up the postMessage token channel.
//
// Lifecycle:
//   1. Call refreshAuthToken for the initial token.
//   2. Build the iframe src with the token in the URL fragment — the
//      iframe reads this synchronously on mount, so the first API call
//      it makes already carries a Bearer. Fragment-based delivery means
//      the token never hits the network: RFC 7231 §5.5.2 excludes
//      fragments from the Referer header.
//   3. Append iframe to the parent element and open the host channel.
//   4. On subsequent TOKEN_REQUESTs (iframe's scheduled refresh, or 401
//      fallback), call refreshAuthToken again and post back TOKEN_RESPOND.
//
// Returns a handle with the iframe element and a destroy() method that
// tears down the channel and removes the iframe from the DOM.
export async function render(opts: SubtextEmbedOptions): Promise<SubtextEmbedHandle> {
  const parent = resolveParent(opts.parentElement);
  const parts = parseTraceUrl(opts.traceUrl);

  // Mint the initial token. This runs synchronously so the iframe has a
  // Bearer before its first render; without this the iframe would 401
  // on every API call until its first TOKEN_REQUEST resolves.
  const initial = await opts.refreshAuthToken();
  const initialToken = typeof initial === 'string' ? initial : initial.token;

  const iframe = document.createElement('iframe');
  iframe.src = buildEmbedSrc(parts, initialToken);
  iframe.setAttribute('title', 'Subtext Session Replay');
  iframe.setAttribute('allow', 'clipboard-write');
  if (opts.width !== undefined) {
    iframe.style.width = typeof opts.width === 'number' ? `${opts.width}px` : opts.width;
  }
  if (opts.height !== undefined) {
    iframe.style.height = typeof opts.height === 'number' ? `${opts.height}px` : opts.height;
  }
  iframe.style.border = 'none';
  if (opts.iframeAttributes) {
    for (const [k, v] of Object.entries(opts.iframeAttributes)) {
      iframe.setAttribute(k, v);
    }
  }
  parent.appendChild(iframe);

  if (!iframe.contentWindow) {
    // Browsers populate contentWindow synchronously on append, so this
    // should never fire in practice. Defensive because the channel
    // absolutely requires it.
    throw new Error('iframe.contentWindow is null — parent element not in document?');
  }

  const channelOpts: EmbedHostChannelOptions = {
    target: iframe.contentWindow,
    targetOrigin: parts.appHost,
    refreshAuthToken: opts.refreshAuthToken,
    onReady: opts.onReady,
    onError: opts.onError,
    onModeChanged: opts.onModeChanged,
  };
  const channel = new EmbedHostChannel(channelOpts);

  return {
    iframe,
    destroy: () => {
      channel.dispose();
      iframe.remove();
    },
  };
}

function resolveParent(input: HTMLElement | string): HTMLElement {
  if (typeof input === 'string') {
    const el = document.querySelector<HTMLElement>(input);
    if (!el) throw new Error(`parentElement selector "${input}" matched no element`);
    return el;
  }
  return input;
}

// Barrel object so callers can `import { SubtextEmbed } from …` and get
// a namespaced `SubtextEmbed.render(...)` surface matching the design doc.
export const SubtextEmbed = { render };
