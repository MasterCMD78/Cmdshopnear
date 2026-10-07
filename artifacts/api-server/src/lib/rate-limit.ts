type RateLimitWindow = { hits: number[]; windowMs: number };
const windows = new Map<string, RateLimitWindow>();
const MAX_WINDOWS = 10_000;

export function consumeRateLimit(key: string, maxHits: number, windowMs: number) {
  const now = Date.now();
  const previous = windows.get(key);
  const recentHits =
    previous?.windowMs === windowMs
      ? previous.hits.filter((hit) => now - hit < windowMs)
      : [];
  if (recentHits.length >= maxHits) {
    windows.set(key, { hits: recentHits, windowMs });
    return false;
  }
  recentHits.push(now);
  windows.set(key, { hits: recentHits, windowMs });

  if (windows.size > MAX_WINDOWS) {
    for (const [entryKey, entry] of windows) {
      const lastHit = entry.hits[entry.hits.length - 1];
      if (lastHit === undefined || now - lastHit >= entry.windowMs * 2) windows.delete(entryKey);
      if (windows.size <= MAX_WINDOWS) break;
    }
    if (windows.size > MAX_WINDOWS) windows.delete(windows.keys().next().value!);
  }
  return true;
}