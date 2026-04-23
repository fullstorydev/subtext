import {
  type EmbedFrameMessage,
  type EmbedHostMessage,
  type EmbedMode,
  type EmbedErrorCode,
  type TokenData,
  ST_EMBED_PREFIX,
} from './protocol.js';

const LOG_TAG = '[ST_Embed/host]';

// Function the host supplies to mint / refresh an embed token. Can return
// just the token string (simple case) or {token, expiresAt} (enables the
// iframe to schedule a proactive refresh at expiresAt - 60s).
export type RefreshAuthTokenFunc = () =>
  | Promise<string>
  | Promise<{ token: string; expiresAt?: string }>;

export interface EmbedHostChannelOptions {
  target: Window; // iframe.contentWindow
  targetOrigin: string; // app host (origin of the iframe doc), used as
  // both postMessage targetOrigin and inbound origin filter
  refreshAuthToken: RefreshAuthTokenFunc;
  onReady?: () => void;
  onError?: (err: { code: EmbedErrorCode; message?: string }) => void;
  onModeChanged?: (mode: EmbedMode) => void;
}

// Host-side counterpart to the iframe's EmbedChannel. Listens for
// ST_EMBED_* messages from the embedded iframe, calls the user-supplied
// refreshAuthToken on TOKEN_REQUEST, and posts TOKEN_RESPOND back. Also
// dispatches READY / ERROR / MODE_CHANGED to caller-provided callbacks.
//
// The caller owns the iframe lifecycle; the channel just attaches a
// message listener to `window` and filters by source+origin. Call
// dispose() to remove the listener (e.g. on unmount / iframe destroy).
export class EmbedHostChannel {
  private _opts: EmbedHostChannelOptions;
  private _disposed = false;

  constructor(opts: EmbedHostChannelOptions) {
    this._opts = opts;
    window.addEventListener('message', this._listener);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    window.removeEventListener('message', this._listener);
  }

  // Push a fresh token to the iframe without it asking first. Useful
  // when the host knows the token is about to expire and wants to
  // avoid a round-trip delay.
  async pushToken(): Promise<void> {
    if (this._disposed) return;
    const body = await this._mintToken();
    if (this._disposed) return;
    this._post({ name: 'ST_EMBED_TOKEN_RESPOND', body });
  }

  private _post(msg: EmbedHostMessage): void {
    if (this._disposed) return;
    this._opts.target.postMessage(msg, this._opts.targetOrigin);
  }

  private _listener = (evt: MessageEvent<EmbedFrameMessage>): void => {
    if (this._disposed) return;
    // Source identity check is the primary defence — cross-origin frames
    // cannot spoof each other's window references.
    if (evt.source !== this._opts.target) return;
    if (this._opts.targetOrigin !== '*' && evt.origin !== this._opts.targetOrigin) {
      // eslint-disable-next-line no-console
      console.debug(
        `${LOG_TAG} dropped message from ${evt.origin} (expected ${this._opts.targetOrigin})`,
      );
      return;
    }
    const data = evt.data;
    if (!data || typeof data !== 'object' || typeof data.name !== 'string') return;
    if (!data.name.startsWith(ST_EMBED_PREFIX)) return;

    switch (data.name) {
      case 'ST_EMBED_TOKEN_REQUEST':
        void this._handleTokenRequest(data.reqId);
        break;
      case 'ST_EMBED_READY_EVT':
        this._opts.onReady?.();
        break;
      case 'ST_EMBED_ERROR_EVT':
        this._opts.onError?.({ code: data.code, message: data.message });
        break;
      case 'ST_EMBED_MODE_CHANGED':
        this._opts.onModeChanged?.(data.mode);
        break;
      default:
        // Unknown ST_EMBED_* message: no-op for forward compat.
        break;
    }
  };

  private async _handleTokenRequest(reqId: string): Promise<void> {
    try {
      const body = await this._mintToken();
      if (this._disposed) return;
      this._post({ name: 'ST_EMBED_TOKEN_RESPOND', reqId, body });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.debug(`${LOG_TAG} refreshAuthToken threw for reqId=${reqId}:`, err);
      this._opts.onError?.({
        code: 'auth_failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async _mintToken(): Promise<TokenData> {
    const result = await this._opts.refreshAuthToken();
    if (typeof result === 'string') {
      return { tokenType: 'Bearer', tokenString: result };
    }
    return {
      tokenType: 'Bearer',
      tokenString: result.token,
      expiresAt: result.expiresAt,
    };
  }
}
