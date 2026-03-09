# Why This Is Not Blazingly Fast

Date: 2026-03-09

## Short Answer

Because the user-visible latency is mostly not database latency.

The slow feeling comes from:
- deliberate simulation timing
- event-to-render sequencing
- large reactive scene updates
- animation semantics that wait for backend state to exist

## Breakdown

### 1. Backend timing is intentionally slow

From `services/python-fast-api/src/simulation.py`:

- `EMIT_INTERVAL_MS = 1400`
- `DRAIN_INTERVAL_MS = 600`

These are huge compared to typical UI expectations.
For a human, `1400ms` before the first anomaly packet appears feels laggy even if CPU usage is near zero.

### 2. `Inject Anomaly` is not immediate mutation

The endpoint does not create an anomaly packet instantly.
It sets a flag so the next emit cycle produces anomaly data.

That means:
- click is immediate
- server acknowledgement is immediate
- visible anomaly data is delayed by scheduler timing

So the button feels sluggish even when the request is not.

### 3. The scene is reactive in too many places

The pipeline scene reacts to:
- `edgeStorage`
- `centralStorage`
- `packetsInTransit`
- `enabledTurbines`
- `forcedAnomalyTurbine`
- `edgePressure`
- `isRunning`
- `isOnline`

That is a lot of state for one SVG scene.
This is a reactivity architecture issue, not a Python issue.

### 4. Visual motion is still derived from backend events

If the backend emits late, animation starts late.
The browser can animate smoothly once it starts, but it cannot invent earlier intent timing on its own unless the UI does optimistic motion.

### 5. Database work is not the dominant bottleneck

At this project scale:
- Couchbase is fast enough
- Edge Server writes are cheap enough
- Python can easily handle this event rate

The bigger issue is that user actions are sequenced through demo timing rules and large scene updates.

## Most Likely "Stupid Stuff"

1. Treating simulation cadence as if it were UI responsiveness.
2. Binding user-visible animations to data creation instead of user intent.
3. Letting one big SVG component subscribe to too many store slices.
4. Keeping large logic hubs:
   - `simulation.py`
   - `PipelineView.tsx`
   - `pipelineStore.ts`

## Recommendation

If the goal is "feels instantaneous":

1. Keep backend simulation timing for data realism if needed.
2. Add optimistic UI intent feedback immediately on click.
3. Start packet/anomaly visuals immediately, then reconcile with backend data.
4. Keep the database and backend authoritative for truth, not for first-frame UX.

That is the core distinction:
- truth can be backend-owned
- responsiveness should still be frontend-owned
