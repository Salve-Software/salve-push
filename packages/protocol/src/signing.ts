// Canonical release signing (ADR 0003): amarra bundle_hash ao metadata do release.
// Usa hashing puro-JS (@noble/hashes) em vez de WebCrypto: precisa rodar
// idêntico em Node (CLI) e Hermes/React Native (SDK), e Hermes não expõe
// globalThis.crypto.subtle sem polyfill.
import * as ed25519 from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";

ed25519.etc.sha512Sync = (...messages) => sha512(ed25519.etc.concatBytes(...messages));

export interface ReleaseSigningInput {
  bundleHash: string;
  version: string;
  platform: string;
  channel: string;
  runtimeVersion: string;
}

export interface SigningKeyPair {
  privateKey: string;
  publicKey: string;
}

export function canonicalReleaseMessage(input: ReleaseSigningInput): string {
  return [input.bundleHash, input.version, input.platform, input.channel, input.runtimeVersion].join("\n");
}

export function sha256Hex(bytes: Uint8Array): string {
  return ed25519.etc.bytesToHex(sha256(bytes));
}

export async function generateSigningKeyPair(): Promise<SigningKeyPair> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKey: Buffer.from(privateKey).toString("base64"),
    publicKey: Buffer.from(publicKey).toString("base64"),
  };
}

export async function signRelease(privateKeyBase64: string, input: ReleaseSigningInput): Promise<string> {
  const privateKey = Buffer.from(privateKeyBase64, "base64");
  const message = new TextEncoder().encode(canonicalReleaseMessage(input));
  const signature = ed25519.sign(message, privateKey);
  return Buffer.from(signature).toString("base64");
}

export async function verifyRelease(
  publicKeyBase64: string,
  input: ReleaseSigningInput,
  signatureBase64: string
): Promise<boolean> {
  try {
    const publicKey = Buffer.from(publicKeyBase64, "base64");
    const signature = Buffer.from(signatureBase64, "base64");
    const message = new TextEncoder().encode(canonicalReleaseMessage(input));
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
