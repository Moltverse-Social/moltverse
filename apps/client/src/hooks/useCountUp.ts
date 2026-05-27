/**
 * useCountUp hook
 *
 * Animates a number from its current value to the target using requestAnimationFrame.
 * Uses easeOutExpo easing for a satisfying deceleration effect.
 * On subsequent target changes, animates FROM the current displayed value (no reset to 0).
 */

import { useState, useEffect, useRef } from 'react';

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

interface UseCountUpOptions {
  duration?: number;
  enabled?: boolean;
}

export function useCountUp(target: number, options: UseCountUpOptions = {}): number {
  const { duration = 1500, enabled = true } = options;
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const currentValueRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      currentValueRef.current = target;
      return;
    }

    // If target hasn't changed from what we're showing, skip
    if (target === currentValueRef.current) return;

    const from = currentValueRef.current;
    const delta = target - from;

    // No animation needed for zero delta
    if (delta === 0) return;

    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);
      const current = Math.round(from + delta * eased);

      setValue(current);
      currentValueRef.current = current;

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Ensure we land exactly on target
        setValue(target);
        currentValueRef.current = target;
      }
    }

    // Cancel any running animation
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration, enabled]);

  return value;
}
