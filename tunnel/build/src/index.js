#!/usr/bin/env node
import { version } from 'node:process';
const [major, minor] = version.substring(1).split('.').map(Number);
if (major === 20 && minor < 11) {
    console.error(`ERROR: \`subtext-tunnel\` does not support Node ${process.version}. Please upgrade to Node 20.11.0 LTS or a newer LTS.`);
    process.exit(1);
}
if (major === 22 && minor < 12) {
    console.error(`ERROR: \`subtext-tunnel\` does not support Node ${process.version}. Please upgrade to Node 22.12.0 LTS or a newer LTS.`);
    process.exit(1);
}
if (major < 20) {
    console.error(`ERROR: \`subtext-tunnel\` does not support Node ${process.version}. Please upgrade to Node 20.11.0 LTS or a newer LTS.`);
    process.exit(1);
}
await import('./main.js');
