// Signing key lifecycle for `salve-push keys generate` / `salve-push release` (ADR 0003).
import { generateSigningKeyPair } from "@salve-push/protocol";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface GenerateSigningKeyOptions {
  force?: boolean;
}

export function resolveSigningKeyPath(cwd: string): string {
  return join(cwd, ".salve-push", "signing.key");
}

export async function generateAndWriteSigningKey(
  cwd: string,
  options: GenerateSigningKeyOptions = {}
): Promise<{ publicKey: string; keyPath: string }> {
  const keyPath = resolveSigningKeyPath(cwd);
  if (!options.force) {
    const existing = await readFile(keyPath, "utf8").catch(() => null);
    if (existing !== null) {
      throw new Error(
        `Signing key already exists at ${keyPath}. Overwriting it invalidates every app build that ` +
          "already embeds its public key. Pass --force to overwrite anyway."
      );
    }
  }
  const { privateKey, publicKey } = await generateSigningKeyPair();
  await mkdir(dirname(keyPath), { recursive: true });
  await writeFile(keyPath, privateKey, { mode: 0o600 });
  return { publicKey, keyPath };
}

export async function loadSigningPrivateKey(cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  if (env.SALVE_PUSH_SIGNING_KEY) {
    return env.SALVE_PUSH_SIGNING_KEY;
  }
  try {
    return (await readFile(resolveSigningKeyPath(cwd), "utf8")).trim();
  } catch {
    throw new Error(
      'No signing key found. Run "salve-push keys generate" first, or set SALVE_PUSH_SIGNING_KEY.'
    );
  }
}
