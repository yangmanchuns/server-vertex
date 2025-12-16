const processed = new Map(); // eventId -> timestamp(ms)
const TTL_MS = 5 * 60 * 1000; // 5분

export function isDuplicateEvent(eventId) {
  if (!eventId) return false;

  const now = Date.now();

  // TTL 청소
  for (const [k, ts] of processed) {
    if (now - ts > TTL_MS) processed.delete(k);
  }

  if (processed.has(eventId)) return true;

  processed.set(eventId, now);
  return false;
}
