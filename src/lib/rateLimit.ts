// Simple in-memory sliding-window limiter. Enough for a public demo on a single
// instance; use Redis / Upstash for a multi-instance production deployment.
const hits = new Map<string, number[]>();

export function isRateLimited(key: string, max = 15, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}
