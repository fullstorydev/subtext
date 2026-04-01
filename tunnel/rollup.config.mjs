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
  plugins: [
    cleanup({
      comments: [/Copyright/i],
    }),
    commonjs(),
    json(),
    nodeResolve(),
  ],
};
