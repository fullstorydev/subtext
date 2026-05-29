#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const isWindows = process.platform === "win32";
const binary = path.join(
  __dirname,
  "..",
  "vendor",
  isWindows ? "subtext.exe" : "subtext"
);

const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });

if (result.error) {
  if (result.error.code === "ENOENT") {
    console.error(
      "subtext: binary not found. Try reinstalling: npm install @subtextdev/subtext-cli"
    );
  } else {
    console.error("subtext:", result.error.message);
  }
  process.exit(1);
}

process.exit(result.status ?? 1);
