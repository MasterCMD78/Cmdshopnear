const windows = new Map<string, number[]>();

export function consumeRateLimit(key: string, maxHits: number, windowMs: number) {
  const now = Date.now();
  const recentHits = (windows.get(key) ?? []).filter((hit) => now - hit < windowMs);
  if (recentHits.length >= maxHits) {
    windows.set(key, recentHits);
    return false;
  }
  recentHits.push(now);
  windows.set(key, recentHits);

  if (windows.size > 10_000) {
    for (const [entryKey, hits] of windows) {
      if (!hits.length || now - hits[hits.length - 1]! >= windowMs * 2) windows.delete(entryKey);
    }
  }
  return true;
}