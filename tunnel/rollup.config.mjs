import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import cleanup from 'rollup-plugin-cleanup';

// Bundle the entire CLI into a single self-contained file. tsc emits to
// build/ (used by tests + dev); rollup reads that and emits to dist/, which
// is what `npm publish` ships. Keeping input/output in different trees means
// `build` and `bundle` never clobber each other's output.
export default {
  // index.ts is the real entry point: it does a Node-version check and then
  // dynamic-imports main. inlineDynamicImports below pulls main into the same
  // bundled file so we ship one self-contained ./dist/index.js.
  input: './build/src/index.js',
  output: {
    file: './dist/index.js',
    sourcemap: false,
    format: 'esm',
    inlineDynamicImports: true,
    // Shebang is carried over from src/index.ts; no banner needed.
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
