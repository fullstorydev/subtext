// React entry — thin wrapper around the vanilla SDK.
//
// Usage:
//   import { SubtextEmbed } from '@subtextdev/subtext-embed/react';
//
//   <SubtextEmbed
//     traceUrl="https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz"
//     refreshAuthToken={async () => ({ token, expiresAt })}
//     onReady={() => {}}
//     width="100%"
//     height={675}
//   />

import * as React from 'react';
import { render as renderEmbed, type SubtextEmbedHandle } from './embed.js';
import type { RefreshAuthTokenFunc } from './channel.js';
import type { EmbedMode, EmbedErrorCode } from './protocol.js';

export interface SubtextEmbedProps {
  traceUrl: string;
  refreshAuthToken: RefreshAuthTokenFunc;
  onReady?: () => void;
  onError?: (err: { code: EmbedErrorCode; message?: string }) => void;
  onModeChanged?: (mode: EmbedMode) => void;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export const SubtextEmbed: React.FC<SubtextEmbedProps> = props => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // Callbacks are stable per-mount via refs so re-renders of the parent
  // don't tear down and re-create the iframe (which would interrupt
  // playback and re-fire READY).
  const callbacksRef = React.useRef({
    refreshAuthToken: props.refreshAuthToken,
    onReady: props.onReady,
    onError: props.onError,
    onModeChanged: props.onModeChanged,
  });
  React.useEffect(() => {
    callbacksRef.current = {
      refreshAuthToken: props.refreshAuthToken,
      onReady: props.onReady,
      onError: props.onError,
      onModeChanged: props.onModeChanged,
    };
  });

  React.useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;

    let handle: SubtextEmbedHandle | null = null;
    let cancelled = false;

    (async () => {
      try {
        const h = await renderEmbed({
          parentElement: parent,
          traceUrl: props.traceUrl,
          // Delegate through the ref so the iframe sees the latest caller
          // while surviving parent re-renders.
          refreshAuthToken: () => callbacksRef.current.refreshAuthToken(),
          onReady: () => callbacksRef.current.onReady?.(),
          onError: err => callbacksRef.current.onError?.(err),
          onModeChanged: mode => callbacksRef.current.onModeChanged?.(mode),
          width: props.width,
          height: props.height,
        });
        if (cancelled) {
          h.destroy();
          return;
        }
        handle = h;
      } catch (err) {
        callbacksRef.current.onError?.({
          code: 'unknown',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
      handle?.destroy();
    };
    // Re-mount iframe iff the trace target itself changes. Size changes
    // are applied via inline style without tearing down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.traceUrl]);

  React.useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    const iframe = parent.querySelector('iframe');
    if (!iframe) return;
    if (props.width !== undefined) {
      iframe.style.width = typeof props.width === 'number' ? `${props.width}px` : props.width;
    }
    if (props.height !== undefined) {
      iframe.style.height = typeof props.height === 'number' ? `${props.height}px` : props.height;
    }
  }, [props.width, props.height]);

  return <div ref={containerRef} className={props.className} style={props.style} />;
};
