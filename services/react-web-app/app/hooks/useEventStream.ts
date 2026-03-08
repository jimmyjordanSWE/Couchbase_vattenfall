import { useEffect, useRef } from "react";
import { usePipelineStore } from "~/stores/pipelineStore";
import { edgeguardApi, getBaseUrl } from "~/lib/api";
import type { PipelineSnapshot } from "~/lib/api";

/**
 * Opens an EventSource to the backend SSE stream and dispatches
 * incoming events to the pipeline store.
 */
export function useEventStream(enabled: boolean) {
  const esRef = useRef<EventSource | null>(null);
  const applySnapshot = usePipelineStore((s) => s.applySnapshot);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    edgeguardApi.getSnapshot()
      .then((snapshot) => {
        if (!cancelled) {
          applySnapshot(snapshot);
        }
      })
      .catch(() => {});

    const url = `${getBaseUrl()}/api/stream/events`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("snapshot", (e) => {
      const snapshot: PipelineSnapshot = JSON.parse(e.data);
      applySnapshot(snapshot);
    });

    es.onerror = () => {
      // EventSource auto-reconnects; nothing special needed
    };

    return () => {
      cancelled = true;
      es.close();
      esRef.current = null;
    };
  }, [enabled, applySnapshot]);
}
