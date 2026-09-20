// Canonical release signing (ADR 0003): amarra bundle_hash ao metadata do release.
// Usa hashing puro-JS (@noble/hashes) em vez de WebCrypto, e atob/btoa em vez de Buffer:
// precisa rodar idêntico em Node (CLI) e Hermes/React Native (SDK). Hermes não expõe
// globalThis.crypto.subtle nem Buffer sem polyfill, mas ambos os runtimes têm atob/btoa.
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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
    privateKey: bytesToBase64(privateKey),
    publicKey: bytesToBase64(publicKey),
  };
}

export async function signRelease(privateKeyBase64: string, input: ReleaseSigningInput): Promise<string> {
  const privateKey = base64ToBytes(privateKeyBase64);
  const message = new TextEncoder().encode(canonicalReleaseMessage(input));
  const signature = ed25519.sign(message, privateKey);
  return bytesToBase64(signature);
}

export async function verifyRelease(
  publicKeyBase64: string,
  input: ReleaseSigningInput,
  signatureBase64: string
): Promise<boolean> {
  try {
    const publicKey = base64ToBytes(publicKeyBase64);
    const signature = base64ToBytes(signatureBase64);
    const message = new TextEncoder().encode(canonicalReleaseMessage(input));
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
