# Tree-sitter Symbol Snapshot

This is a compact symbol-level view of the most important backend hotspot.

## `simulation.py`

Parser-backed symbols observed in [`services/python-fast-api/src/simulation.py`](/home/jimmy/hackathons/Couchbase_vattenfall/services/python-fast-api/src/simulation.py):

### Top-level helpers

```text
_std_dev
_merge_mixed_run
_compute_pressure
_classify_edge_item
_now_ms
```

### `SimulationEngine` methods

```text
__init__
subscribe
unsubscribe
_publish
get_snapshot_dict
_next_seq
_generate_point
_compact
_run_compaction
_persist_edge_reading
_persist_edge_anomaly
_persist_compacted
_drop_oldest_normal_once
_publish_metrics
_emit_loop
_drain_loop
get_metrics_dict
get_status_dict
get_config_dict
initialize
start
stop
reload_edge_storage_from_server
hydrate_from_persistence
set_online
inject_anomaly
clear_anomaly
set_turbine_enabled
clear_edge_storage
clear_central_storage
clear_all_storage
```

## Why this matters

A single class still owns:

- generation
- state mutation
- persistence
- buffering
- compaction
- connection mode
- SSE event shaping
- lifecycle control

That is the clearest structural sign that the codebase is fighting architecture rather than compute limits.
