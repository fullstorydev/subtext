#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { createRequire } from "node:module";
import { registerCommands } from "./commands.js";

const _require = createRequire(import.meta.url);
const pkg = _require("../../../package.json");

const argv = yargs(hideBin(process.argv));
argv.version(pkg.version);
registerCommands(argv);
argv
  .fail((msg: string | null, err: Error | null) => {
    if (err) {
      console.error(`Error: ${err.message}`);
    } else if (msg) {
      console.error(msg);
    }
    process.exit(1);
  })
  .demandCommand(1, "Run subtext --help for usage")
  .strict()
  .help()
  .parse();
