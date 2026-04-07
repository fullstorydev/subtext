#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { registerCommands } from "./commands.js";

const argv = yargs(hideBin(process.argv));
registerCommands(argv);
argv
  .demandCommand(1, "Run subtext --help for usage")
  .strict()
  .help()
  .parse();
