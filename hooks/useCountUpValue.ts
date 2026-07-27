import { useEffect, useRef, useState } from 'react';

export function useCountUpValue(
  target: number,
  options?: { durationMs?: number; enabled?: boolean },
): number {
  const durationMs = options?.durationMs ?? 1200;
  const enabled = options?.enabled ?? true;
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return undefined;
    }

    startRef.current = null;
    const from = 0;
    const to = Math.max(0, target);

    const tick = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setValue(from + (to - from) * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setValue(to);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [durationMs, enabled, target]);

  return value;
}

export function formatCadAmount(amount: number): string {
  return `$${amount.toFixed(2)} CAD`;
}
