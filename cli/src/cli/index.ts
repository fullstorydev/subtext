#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { registerCommands } from "./commands.js";

const argv = yargs(hideBin(process.argv));
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
