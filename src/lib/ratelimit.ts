/**
 * Fixed window rate limiter for the public intake form (spam protection), version 1.0 addition.
 * In memory is sufficient for a single server instance; a shared store (e.g. Redis) would be
 * needed when the application is scaled horizontally.
 */
import { RATE_LIMIT } from "./config";

const hits = new Map<string, number[]>();

export function allowRequest(key: string, nowMs = Date.now(), limit = RATE_LIMIT.maxRequests, windowMinutes = RATE_LIMIT.windowMinutes): boolean {
  const windowStart = nowMs - windowMinutes * 60_000;
  const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= limit) { hits.set(key, recent); return false; }
  recent.push(nowMs);
  hits.set(key, recent);
  return true;
}

export function resetRateLimit(): void {
  hits.clear();
}
