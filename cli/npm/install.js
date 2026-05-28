#!/usr/bin/env node
// Postinstall: download the subtext binary for this platform from GitHub Releases.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

if (process.env.SUBTEXT_SKIP_DOWNLOAD === "1") {
  console.log("subtext: skipping binary download (SUBTEXT_SKIP_DOWNLOAD=1)");
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const version = pkg.version.replace(/^v/, "");

const platformMap = { darwin: "darwin", linux: "linux", win32: "windows" };
const archMap = { x64: "amd64", arm64: "arm64" };

const goPlatform = platformMap[process.platform];
const goArch = archMap[process.arch];

if (!goPlatform || !goArch) {
  console.error(
    `subtext: unsupported platform ${process.platform}/${process.arch}. ` +
      "Install manually: https://github.com/fullstorydev/subtext/releases"
  );
  process.exit(1);
}

const isWindows = process.platform === "win32";
const ext = isWindows ? ".zip" : ".tar.gz";
const archiveName = `subtext_${goPlatform}_${goArch}${ext}`;
const releaseTag = `cli-v${version}`;
const downloadURL = `https://github.com/fullstorydev/subtext/releases/download/${releaseTag}/${archiveName}`;

const vendorDir = path.join(__dirname, "vendor");
const binaryName = isWindows ? "subtext.exe" : "subtext";
const binaryPath = path.join(vendorDir, binaryName);

if (fs.existsSync(binaryPath)) {
  process.exit(0);
}

fs.mkdirSync(vendorDir, { recursive: true });

console.log(`subtext: downloading ${downloadURL}`);

function download(url, dest, cb) {
  const file = fs.createWriteStream(dest);
  https
    .get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest, cb);
      }
      if (res.statusCode !== 200) {
        file.close();
        return cb(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(cb));
    })
    .on("error", (err) => {
      fs.unlinkSync(dest);
      cb(err);
    });
}

const tmp = path.join(os.tmpdir(), archiveName);

download(downloadURL, tmp, (err) => {
  if (err) {
    console.error("subtext: download failed:", err.message);
    process.exit(1);
  }

  try {
    if (isWindows) {
      execFileSync("powershell", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Force '${tmp}' '${vendorDir}'`,
      ]);
    } else {
      execFileSync("tar", ["-xzf", tmp, "-C", vendorDir, binaryName]);
    }
    fs.unlinkSync(tmp);
    if (!isWindows) {
      fs.chmodSync(binaryPath, 0o755);
    }
    console.log(`subtext: installed ${binaryPath}`);
  } catch (e) {
    console.error("subtext: extraction failed:", e.message);
    process.exit(1);
  }
});
