# Tree-sitter Hotspot Map

This is a parser-backed structural pass over the codebase, focused on files that dominate runtime behavior and architectural coupling.

## Largest app-specific files

These are the biggest non-generated project files in the backend/frontend paths:

```text
838  services/react-web-app/app/components/pipeline/PipelineView.tsx
727  services/python-fast-api/src/simulation.py
492  services/python-fast-api/src/db.py
411  services/react-web-app/app/stores/pipelineStore.ts
374  services/react-web-app/app/routes/demo.tsx
329  services/python-fast-api/src/anomaly_detector.py
212  services/react-web-app/app/components/dashboard/TurbineCard.tsx
192  services/react-web-app/app/components/dashboard/StoragePanel.tsx
186  services/react-web-app/app/components/dashboard/IntroTour.tsx
```

## What tree-sitter makes obvious

### 1. `simulation.py` is still the backend gravity well

Tree-sitter tags show that [`services/python-fast-api/src/simulation.py`](/home/jimmy/hackathons/Couchbase_vattenfall/services/python-fast-api/src/simulation.py) still contains:

- data generation
- anomaly scoring calls
- compaction
- drain orchestration
- SSE publish behavior
- persistence hydration
- storage clearing
- status/config/metrics shaping

Important tagged methods include:

```text
_generate_point
_compact
_run_compaction
_emit_loop
_drain_loop
reload_edge_storage_from_server
hydrate_from_persistence
set_online
inject_anomaly
clear_edge_storage
clear_central_storage
clear_all_storage
```

That is too many responsibilities for one runtime object. Even after recent cleanup, this file is still where timing semantics, storage semantics, and event semantics are fused together.

### 2. `PipelineView.tsx` is too large to be a reliable scene boundary

[`services/react-web-app/app/components/pipeline/PipelineView.tsx`](/home/jimmy/hackathons/Couchbase_vattenfall/services/react-web-app/app/components/pipeline/PipelineView.tsx) is now the single largest app-specific file at 838 lines. That usually means:

- presentation and animation logic are not fully separated
- local visual state and domain-derived state are still mixed
- scene-level behavior changes are expensive to reason about

Even if the code is correct, this file is large enough to hide reactive coupling and accidental rerender triggers.

### 3. `pipelineStore.ts` remains an architectural choke point

[`services/react-web-app/app/stores/pipelineStore.ts`](/home/jimmy/hackathons/Couchbase_vattenfall/services/react-web-app/app/stores/pipelineStore.ts) is 411 lines and still owns:

- snapshot application
- edge updates
- central updates
- compaction logs
- packet trigger state
- anomaly state
- reset/init behavior

That means the frontend store is still acting as both:

- domain reducer
- scene event bus

Those should keep moving apart.

## Runtime-sensitive loops and timers

The latency problem is not raw compute. It is mostly timing, loop boundaries, and cross-layer coordination.

### Backend hot loops

[`services/python-fast-api/src/simulation.py`](/home/jimmy/hackathons/Couchbase_vattenfall/services/python-fast-api/src/simulation.py) contains the real runtime loops:

- `_emit_loop`
- `_drain_loop`
- repeated compaction retry loops with `max_compact_rounds = 20`
- reload/rehydration loops that compact and evict until under capacity

This is the part that decides when the user sees anything.

### Frontend timers

The frontend still contains several event-driven timers:

- [`services/react-web-app/app/components/pipeline/PipelineView.tsx`](/home/jimmy/hackathons/Couchbase_vattenfall/services/react-web-app/app/components/pipeline/PipelineView.tsx): anomaly pending timer, compaction flash timer
- [`services/react-web-app/app/components/dashboard/StoragePanel.tsx`](/home/jimmy/hackathons/Couchbase_vattenfall/services/react-web-app/app/components/dashboard/StoragePanel.tsx): compact flash and sync pulse timers
- [`services/react-web-app/app/components/dashboard/IntroTour.tsx`](/home/jimmy/hackathons/Couchbase_vattenfall/services/react-web-app/app/components/dashboard/IntroTour.tsx): auto-advance timer
- [`services/react-web-app/app/components/dashboard/HeaderBar.tsx`](/home/jimmy/hackathons/Couchbase_vattenfall/services/react-web-app/app/components/dashboard/HeaderBar.tsx): clock interval

None of those is individually expensive. The problem is that the main pipeline scene and store are already large, so each extra timer increases the chance of unnecessary work and perceived jitter.

## Immediate architectural conclusions

1. The system is not slow because of Python or Couchbase. The obvious parser-backed hotspots are oversized coordinator files.
2. User-visible lag is mainly introduced by simulation timing and UI event choreography, not database throughput.
3. The next refactor target should be file and responsibility shrinkage, not micro-optimizing individual math or network calls.

## Recommended next reductions

1. Split [`simulation.py`](/home/jimmy/hackathons/Couchbase_vattenfall/services/python-fast-api/src/simulation.py) into generator, compactor, drain coordinator, and event publisher modules.
2. Split [`PipelineView.tsx`](/home/jimmy/hackathons/Couchbase_vattenfall/services/react-web-app/app/components/pipeline/PipelineView.tsx) into scene shell, packet layer, edge tank, and turbine cluster components.
3. Keep reducing [`pipelineStore.ts`](/home/jimmy/hackathons/Couchbase_vattenfall/services/react-web-app/app/stores/pipelineStore.ts) until it is only a domain reducer, not a visual event dispatcher.
