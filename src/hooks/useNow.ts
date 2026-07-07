import { useEffect, useState } from "react";

/**
 * A ticking clock. Re-renders on the given interval so countdowns stay live.
 * Defaults to once a second.
 */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
