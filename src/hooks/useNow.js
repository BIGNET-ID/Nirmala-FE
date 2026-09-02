import { useEffect, useState } from 'react';

// Ticks every `intervalMs` so time-based derived state (sensor staleness in
// statusBucket()) keeps updating even when no new data arrives from the
// stream — a sensor's Unavailable/Inactive status changes purely by the
// clock moving, not by any new payload.
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
