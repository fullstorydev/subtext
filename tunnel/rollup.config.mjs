import fs from 'node:fs';
import path from 'node:path';

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import cleanup from 'rollup-plugin-cleanup';

const thirdPartyDir = './build/src/third_party';

export default {
  input: path.join(thirdPartyDir, 'index.js'),
  output: {
    file: path.join(thirdPartyDir, 'index.js'),
    sourcemap: false,
    format: 'esm',
    inlineDynamicImports: true,
  },
  // yargs and tslib emit TypeScript's __classPrivateField helpers that read
  // `this` at module top-level for a CJS caching trick. Rollup's ESM output
  // rewrites `this` to undefined and warns; pointing it at globalThis lets
  // the helper's `(this && this.x) || fallback` pattern evaluate cleanly.
  moduleContext: (id) =>
    /node_modules\/(yargs|tslib)\//.test(id) ? 'globalThis' : undefined,
  plugins: [
    cleanup({
      comments: [/Copyright/i],
    }),
    commonjs(),
    json(),
    nodeResolve(),
  ],
  onwarn(warning, warn) {
    // Cycles inside third-party packages (zod, zod-to-json-schema) are not
    // something we can fix. Still warn about cycles in our own code.
    if (
      warning.code === 'CIRCULAR_DEPENDENCY' &&
      warning.message.includes('node_modules')
    ) {
      return;
    }
    warn(warning);
  },
};
