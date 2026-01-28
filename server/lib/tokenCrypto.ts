import crypto from "node:crypto";

const PREFIX = "enc:v1:";
const IV_LENGTH = 12;

function parseKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required");
  }

  const normalized = raw.trim();

  if (normalized.startsWith("base64:")) {
    const buf = Buffer.from(normalized.slice("base64:".length), "base64");
    if (buf.length === 32) return buf;
  }

  if (normalized.startsWith("hex:")) {
    const buf = Buffer.from(normalized.slice("hex:".length), "hex");
    if (buf.length === 32) return buf;
  }

  if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
    return Buffer.from(normalized, "hex");
  }

  if (normalized.length === 32) {
    return Buffer.from(normalized, "utf8");
  }

  const base64Buf = Buffer.from(normalized, "base64");
  if (base64Buf.length === 32) return base64Buf;

  throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes (hex/base64/raw)");
}

function encryptString(plainText: string): string {
  const key = parseKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64")}:${tag.toString(
    "base64"
  )}:${ciphertext.toString("base64")}`;
}

function decryptString(payload: string): string {
  const key = parseKey();
  const encoded = payload.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = encoded.split(":");

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload format");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
}

export function encryptForStorage(value: string): string {
  if (value.startsWith(PREFIX)) return value;
  return encryptString(value);
}

export function decryptIfNeeded(value: string): string {
  if (!value.startsWith(PREFIX)) return value;
  return decryptString(value);
}
