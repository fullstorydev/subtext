// Vanilla / framework-agnostic entry.
//
// Usage:
//   import { SubtextEmbed } from '@subtextdev/subtext-embed';
//
//   const handle = await SubtextEmbed.render({
//     parentElement: '#replay',
//     traceUrl: 'https://app.fullstory.com/subtext/o-ABC/trace/tr-xyz',
//     refreshAuthToken: async () => ({ token, expiresAt }),
//   });
//   // ...
//   handle.destroy();

export { render, SubtextEmbed } from './embed.js';
export type { SubtextEmbedOptions, SubtextEmbedHandle } from './embed.js';
export type { RefreshAuthTokenFunc } from './channel.js';
export type {
  EmbedMode,
  EmbedErrorCode,
  TokenData,
} from './protocol.js';
