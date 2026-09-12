// Signing key lifecycle for `salve-push keys generate` / `salve-push release` (ADR 0003).
import { generateSigningKeyPair } from "@salve-push/protocol";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function resolveSigningKeyPath(cwd: string): string {
  return join(cwd, ".salve-push", "signing.key");
}

export async function generateAndWriteSigningKey(cwd: string): Promise<{ publicKey: string; keyPath: string }> {
  const { privateKey, publicKey } = await generateSigningKeyPair();
  const keyPath = resolveSigningKeyPath(cwd);
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
