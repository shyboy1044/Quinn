import crypto from "crypto";

// A stateless, tamper-proof unsubscribe token: HMAC(email) truncated.
// This lets us build a one-click unsubscribe URL without a DB lookup,
// and verify it came from us (not a forged request).

function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s) throw new Error("UNSUBSCRIBE_SECRET is not set");
  return s;
}

export function signEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return crypto
    .createHmac("sha256", secret())
    .update(normalized)
    .digest("hex")
    .slice(0, 32);
}

export function verifyToken(email: string, token: string): boolean {
  const expected = signEmail(email);
  // constant-time compare to avoid timing attacks
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function unsubscribeUrl(email: string): string {
  const base = process.env.APP_BASE_URL || "http://localhost:3000";
  const token = signEmail(email);
  const params = new URLSearchParams({ email, token });
  return `${base}/api/unsubscribe?${params.toString()}`;
}
