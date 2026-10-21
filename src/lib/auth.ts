/**
 * Developer dashboard login, version 1.0 addition.
 *
 * A single developer account is enough for a one person company, so the design is a shared
 * password (DASHBOARD_PASSWORD) and a signed session cookie:
 *   cookie value = <expiry timestamp>.<HMAC-SHA256(expiry, secret)>
 * The signature uses the Web Crypto API, which runs both in the Next.js proxy and in Node.
 * Without DASHBOARD_PASSWORD the prototype stays open (demo mode) and shows a banner.
 */

export const SESSION_COOKIE = "nordiso_session";
export const SESSION_HOURS = 8;

const encoder = new TextEncoder();

function secret(): string {
  return process.env.SESSION_SECRET ?? process.env.DASHBOARD_PASSWORD ?? "";
}

export function authEnabled(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

async function hmac(message: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in constant time to avoid timing attacks on the signature. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(nowMs = Date.now(), key = secret()): Promise<string> {
  const expires = String(nowMs + SESSION_HOURS * 3_600_000);
  return `${expires}.${await hmac(expires, key)}`;
}

export async function verifySession(token: string | undefined, nowMs = Date.now(), key = secret()): Promise<boolean> {
  if (!token || !key) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < nowMs) return false;
  return safeEqual(signature, await hmac(expires, key));
}

export function passwordMatches(candidate: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD ?? "";
  return expected.length > 0 && safeEqual(candidate, expected);
}
