#!/usr/bin/env node
import { Command } from "commander";
import { generateAndWriteSigningKey, loadSigningPrivateKey } from "./keys";
import { publishRelease } from "./release";

const program = new Command();

program.name("salve-push").description("Salve Push OTA CLI").version("0.0.1");

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

const keys = program.command("keys").description("Manage the release signing key pair");

keys
  .command("generate")
  .description("Generate an Ed25519 signing key pair for this project")
  .action(async () => {
    const { publicKey, keyPath } = await generateAndWriteSigningKey(process.cwd());
    console.log(`Private key written to ${keyPath} (keep it out of git, out of the server).`);
    console.log(`Public key (paste into SalvePush.configure({ signingPublicKey: ... })):`);
    console.log(publicKey);
  });

program
  .command("release")
  .description("Sign and publish a bundle as a new OTA release")
  .requiredOption("--server-url <url>", "salve-push-server base URL")
  .requiredOption("--version <version>", "release version, e.g. 1.5.0")
  .requiredOption("--platform <platform>", "ios or android")
  .requiredOption("--channel <channel>", "target channel, e.g. production")
  .requiredOption("--runtime-version <runtimeVersion>", "native runtime version this bundle targets")
  .requiredOption("--bundle <path>", "path to the built JS bundle to publish")
  .option("--rollout <percentage>", "rollout percentage (0-100)", "100")
  .action(async (options) => {
    const privateKey = await loadSigningPrivateKey(process.cwd(), process.env);
    const release = await publishRelease({
      serverUrl: options.serverUrl,
      version: options.version,
      platform: options.platform,
      channel: options.channel,
      runtimeVersion: options.runtimeVersion,
      bundlePath: options.bundle,
      rolloutPercentage: Number(options.rollout),
      privateKey,
    });
    console.log(`Published release ${release.id} (${release.version}, ${release.channel}).`);
  });

program
  .command("releases")
  .description("List releases for the current project")
  .requiredOption("--server-url <url>", "salve-push-server base URL")
  .action(async (options) => {
    const response = await fetch(`${options.serverUrl}/v1/releases`);
    if (!response.ok) {
      throw new Error(`failed to list releases (${response.status}): ${await response.text()}`);
    }
    console.log(JSON.stringify(await response.json(), null, 2));
  });

program.parse();
