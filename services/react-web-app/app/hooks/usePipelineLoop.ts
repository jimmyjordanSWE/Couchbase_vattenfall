import { useEffect, useRef } from "react";

/**
 * Packet animation no longer depends on a 60fps global store loop.
 * Kept as a no-op hook so existing imports can be removed incrementally.
 */
export function usePipelineLoop(enabled: boolean) {
  const last = useRef(performance.now() / 1000);

  useEffect(() => {
    last.current = performance.now() / 1000;
    return () => {
      last.current = 0;
    };
  }, [enabled]);
}
