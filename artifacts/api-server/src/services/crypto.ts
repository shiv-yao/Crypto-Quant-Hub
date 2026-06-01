import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function getDerivedKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "dev-fallback-secret-change-in-prod";
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decrypt(ciphertext: string): string {
  const key = getDerivedKey();
  const [ivHex, encrypted] = ciphertext.split(":");
  if (!ivHex || !encrypted) throw new Error("Invalid ciphertext format");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
