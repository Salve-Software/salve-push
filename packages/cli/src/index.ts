#!/usr/bin/env node
// salve-push CLI — commands per MVP PRD section 21.
// `login`/`init`/`release`/`releases` are stubbed until the server's
// admin API (POST /v1/releases, /publish) is implemented.
import { Command } from "commander";

const program = new Command();

program
  .name("salve-push")
  .description("Salve Push OTA CLI")
  .version("0.0.1");

program
  .command("login")
  .description("Authenticate against a salve-push deployment")
  .action(() => {
    throw new Error("not implemented");
  });

program
  .command("init")
  .description("Configure the current project for Salve Push")
  .action(() => {
    throw new Error("not implemented");
  });

program
  .command("release")
  .description("Build, sign and publish a new OTA release")
  .requiredOption("--version <version>", "release version, e.g. 1.5.0")
  .requiredOption("--channel <channel>", "target channel, e.g. production")
  .action(() => {
    throw new Error("not implemented");
  });

program
  .command("releases")
  .description("List releases for the current project")
  .action(() => {
    throw new Error("not implemented");
  });

program.parse();
