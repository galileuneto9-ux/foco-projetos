import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyBytes(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY inválida.");
  }
  return key;
}

export function encryptSecret(plain: string, keyBase64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(keyBase64), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string, keyBase64: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("TOKEN_CIFRADO_INVALIDO");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(keyBase64), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
