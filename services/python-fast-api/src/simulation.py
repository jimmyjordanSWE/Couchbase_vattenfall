"""
EdgeGuard simulation engine.

Generates realistic multi-feature wind-turbine sensor data, scores it with
Isolation Forest, persists to Couchbase Edge Server via REST API, and lets
Edge Server replicate continuously to Sync Gateway → Couchbase Server.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

import db
from anomaly_detector import (
    detector,
    generate_normal_point,
    generate_anomalous_point,
)
from models.edgeguard import (
    CompactionLogEntry,
    DataPoint,
    Metrics,
    PipelineSnapshot,
    SensorData,
    SystemConfig,
    SystemStatus,
)
from compaction_policy import CompactionPolicyConfig, compact_edge_buffer

EDGE_CAPACITY = 100
COMPACTION_THRESHOLD = 80
TURBINE_COUNT = 3
EMIT_INTERVAL_MS = 140
DRAIN_INTERVAL_MS = 120
RECOVERY_DRAIN_MULTIPLIER = 5
TURBINE_HISTORY_SIZE = 30
TIER1_WINDOW_SIZE = 5
TIER2_MERGE_COUNT = 4
CENTRAL_HISTORY_LIMIT = 120
COMPACTION_LOG_LIMIT = 80


def _compute_pressure(edge_length: int) -> float:
    half = COMPACTION_THRESHOLD * 0.5
    if edge_length <= half:
        return 0.0
    return min(1.0, (edge_length - half) / (EDGE_CAPACITY - half))


# ---------------------------------------------------------------------------
# SimulationEngine
# ---------------------------------------------------------------------------

class SimulationEngine:
    """Owns all pipeline state and runs background emit / drain loops."""

    def __init__(self) -> None:
        self.edge_storage:       list[dict[str, Any]] = []
        self.central_storage:    list[dict[str, Any]] = []
        self.per_turbine_history: dict[int, list[dict[str, Any]]] = {
            i: [] for i in range(1, TURBINE_COUNT + 1)
        }
        self.sequence_number:       int  = 1000
        self.is_online:             bool = True
        self.is_running:            bool = False
        self.is_initialized:        bool = False
        self.compaction_count:      int  = 0
        self.compaction_logs:       list[dict[str, Any]] = []
        self.total_packets_emitted: int  = 0
        self.total_anomalies:       int  = 0
        self.last_sync_timestamp:   int | None = None
        self.edge_pressure:         float = 0.0
        self.queued_anomaly_turbines: list[int] = []
        self.recovery_drain_active: bool = False
        self.mesh_gateway_active: bool = False
        self.central_capacity: int = 500
        self.total_synced_items: int = 0

        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._emit_task:   asyncio.Task[None] | None = None
        self._drain_task:  asyncio.Task[None] | None = None

    # ------------------------------------------------------------------
    # Pub/sub for SSE
    # ------------------------------------------------------------------

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=256)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(q)

    def _publish(self, event_type: str, data: Any) -> None:
        payload = {"type": event_type, "data": data}
        dead: list[asyncio.Queue[dict[str, Any]]] = []
        for q in self._subscribers:
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self._subscribers.discard(q)

    def _publish_snapshot(self) -> None:
        self._publish("snapshot", self.get_snapshot_dict())

    @staticmethod
    def _trim_recent(items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
        if len(items) <= limit:
            return items
        return items[-limit:]

    # ------------------------------------------------------------------
    # Data generation
    # ------------------------------------------------------------------

    def _next_seq(self) -> int:
        self.sequence_number += 1
        return self.sequence_number

    def _generate_point(self) -> DataPoint:
        seq = self._next_seq()
        force_anomaly = bool(self.queued_anomaly_turbines)
        source_turbine = (
            self.queued_anomaly_turbines.pop(0)
            if force_anomaly
            else (seq % TURBINE_COUNT) + 1
        )

        if force_anomaly:
            sensor_dict = generate_anomalous_point(source_turbine, seq)
        else:
            sensor_dict = generate_normal_point(source_turbine, seq)

        sensors = SensorData.model_validate(sensor_dict)
        anomaly_score, label = detector.score(sensors)

        return DataPoint(
            id=f"seq_{seq}",
            seq=seq,
            sourceTurbine=source_turbine,
            sensors=sensors,
            value=sensors.power_output,
            anomalyScore=anomaly_score,
            type=label,
            timestamp=_now_ms(),
        )

    # ------------------------------------------------------------------
    # Compaction
    # ------------------------------------------------------------------

    def _compact(self) -> None:
        decision = compact_edge_buffer(
            self.edge_storage,
            is_online=self.is_online,
            config=CompactionPolicyConfig(
                threshold=COMPACTION_THRESHOLD,
                tier1_window_size=TIER1_WINDOW_SIZE,
                tier2_merge_count=TIER2_MERGE_COUNT,
            ),
        )
        if not decision.changed:
            return

        self.edge_storage = decision.edge_storage
        self.compaction_count += 1
        self.edge_pressure = _compute_pressure(len(self.edge_storage))
        if decision.log_entry is not None:
            self.compaction_logs.append(decision.log_entry)
            self.compaction_logs = self._trim_recent(self.compaction_logs, COMPACTION_LOG_LIMIT)
        for block in decision.persisted_blocks:
            asyncio.create_task(self._persist_compacted(block))
        self._publish_snapshot()

    # ------------------------------------------------------------------
    # Couchbase / Sync Gateway persistence helpers
    # ------------------------------------------------------------------

    async def _persist_edge_reading(self, point_dict: dict, key: str) -> None:
        """Write reading to Edge Server; Edge Server replicates to Sync Gateway → Couchbase Server."""
        await db.edge_put_async(point_dict, key)

    async def _persist_edge_anomaly(self, point_dict: dict, key: str) -> None:
        """Write anomaly to Edge Server; Edge Server replicates to Sync Gateway → Couchbase Server."""
        await db.edge_put_async(point_dict, f"anomaly_{key}")

    async def _persist_compacted(self, block_dict: dict) -> None:
        """Write compacted block to Edge Server; Edge Server replicates to Sync Gateway → Couchbase Server."""
        await db.edge_put_async(block_dict, f"compact_{_now_ms()}")

    # ------------------------------------------------------------------
    # Emit loop
    # ------------------------------------------------------------------

    async def _emit_loop(self) -> None:
        interval = EMIT_INTERVAL_MS / 1000.0
        while True:
            await asyncio.sleep(interval)
            if not self.is_running:
                continue

            point = self._generate_point()
            point_dict = point.model_dump(by_alias=True)

            # Per-turbine history (in-memory for fast SSE)
            hist = self.per_turbine_history.get(point.source_turbine, [])
            hist.append(point_dict)
            if len(hist) > TURBINE_HISTORY_SIZE:
                hist = hist[-TURBINE_HISTORY_SIZE:]
            self.per_turbine_history[point.source_turbine] = hist

            self.total_packets_emitted += 1
            if point.type == "anomaly":
                self.total_anomalies += 1

            self.edge_storage.append(point_dict)
            self.edge_pressure = _compute_pressure(len(self.edge_storage))
            self._publish_snapshot()

            # Persist to Edge Server via REST API (non-blocking)
            asyncio.create_task(self._persist_edge_reading(point_dict, point.id))
            if point.type == "anomaly":
                asyncio.create_task(self._persist_edge_anomaly(point_dict, point.id))

            # Try compaction when offline
            if not self.is_online:
                self._compact()

    # ------------------------------------------------------------------
    # Drain loop — edge → Sync Gateway → central
    # ------------------------------------------------------------------

    def _is_fast_drain_active(self) -> bool:
        return self.recovery_drain_active or self.mesh_gateway_active

    def _current_drain_interval(self) -> float:
        if self._is_fast_drain_active():
            return (DRAIN_INTERVAL_MS / RECOVERY_DRAIN_MULTIPLIER) / 1000.0
        return DRAIN_INTERVAL_MS / 1000.0

    async def _drain_loop(self) -> None:
        while True:
            await asyncio.sleep(self._current_drain_interval())
            if not self.is_running or not (self.is_online or self.mesh_gateway_active):
                continue
            if not self.edge_storage:
                if self.recovery_drain_active:
                    self.recovery_drain_active = False
                    self._publish_snapshot()
                continue

            item = self.edge_storage.pop(0)
            self.edge_pressure = _compute_pressure(len(self.edge_storage))
            self.central_storage.append(item)
            self.central_storage = self._trim_recent(self.central_storage, CENTRAL_HISTORY_LIMIT)
            self.total_synced_items += 1
            self.last_sync_timestamp = _now_ms()
            self._publish_snapshot()
            if not self.edge_storage:
                if self.recovery_drain_active:
                    self.recovery_drain_active = False
                    self._publish_snapshot()
            # Edge Server continuously replicates to Sync Gateway → Couchbase Server;
            # no explicit push needed here.

    # ------------------------------------------------------------------
    # Metrics / status helpers
    # ------------------------------------------------------------------

    def _publish_metrics(self) -> None:
        self._publish("metrics", self.get_metrics_dict())

    def get_metrics_dict(self) -> dict[str, Any]:
        return Metrics(
            totalPacketsEmitted=self.total_packets_emitted,
            totalAnomalies=self.total_anomalies,
            edgePressure=self.edge_pressure,
            compactionCount=self.compaction_count,
            lastSyncTimestamp=self.last_sync_timestamp,
            edgeStorageLength=len(self.edge_storage),
            centralStorageLength=self.total_synced_items,
        ).model_dump(by_alias=True)

    def get_status_dict(self) -> dict[str, Any]:
        return SystemStatus(
            isRunning=self.is_running,
            isInitialized=self.is_initialized,
            isOnline=self.is_online,
            isRecoverySyncActive=self.recovery_drain_active,
            isMeshGatewayActive=self.mesh_gateway_active,
            sequenceNumber=self.sequence_number,
        ).model_dump(by_alias=True)

    def get_config_dict(self) -> dict[str, Any]:
        return SystemConfig(
            edgeCapacity=EDGE_CAPACITY,
            centralCapacity=self.central_capacity,
            compactionThreshold=COMPACTION_THRESHOLD,
            turbineCount=TURBINE_COUNT,
            emitIntervalMs=EMIT_INTERVAL_MS,
            drainIntervalMs=DRAIN_INTERVAL_MS,
        ).model_dump(by_alias=True)

    def get_snapshot_dict(self) -> dict[str, Any]:
        return PipelineSnapshot(
            config=self.get_config_dict(),
            status=self.get_status_dict(),
            metrics=self.get_metrics_dict(),
            edgeStorage=self.edge_storage,
            centralStorage=self.central_storage,
            perTurbineHistory=self.per_turbine_history,
            compactionLogs=self.compaction_logs,
        ).model_dump(by_alias=True)

    # ------------------------------------------------------------------
    # Public control methods
    # ------------------------------------------------------------------

    def initialize(self) -> None:
        self.is_initialized = True
        self._publish_snapshot()

    def reset_pipeline_state(self) -> None:
        """Clear in-memory pipeline state so the UI and emit loop restart cleanly."""
        self.edge_storage = []
        self.central_storage = []
        self.per_turbine_history = {i: [] for i in range(1, TURBINE_COUNT + 1)}
        self.sequence_number = 1000
        self.compaction_count = 0
        self.compaction_logs = []
        self.total_packets_emitted = 0
        self.total_anomalies = 0
        self.total_synced_items = 0
        self.last_sync_timestamp = None
        self.edge_pressure = 0.0
        self.queued_anomaly_turbines = []
        self.recovery_drain_active = False
        self.mesh_gateway_active = False
        self._publish_snapshot()

    async def start(self) -> None:
        if self.is_running:
            return
        self.is_running = True
        self._emit_task  = asyncio.create_task(self._emit_loop())
        self._drain_task = asyncio.create_task(self._drain_loop())
        self._publish_snapshot()

    async def stop(self) -> None:
        if not self.is_running:
            return
        self.is_running = False
        if self._emit_task:
            self._emit_task.cancel()
            self._emit_task = None
        if self._drain_task:
            self._drain_task.cancel()
            self._drain_task = None
        self._publish_snapshot()

    def set_online(self, online: bool) -> None:
        was_offline = not self.is_online
        self.is_online = online

        if was_offline and online:
            self.recovery_drain_active = bool(self.edge_storage)
            self.mesh_gateway_active = False
            self.compaction_logs.append(
                CompactionLogEntry(
                    message="CONNECTION RESTORED — FAST SYNCING EDGE BUFFER",
                    timestamp=_now_ms(),
                    severity="sync",
                ).model_dump(by_alias=True)
            )
            self.compaction_logs = self._trim_recent(self.compaction_logs, COMPACTION_LOG_LIMIT)
        elif not online:
            self.recovery_drain_active = False
            self.mesh_gateway_active = False
            self.compaction_logs.append(
                CompactionLogEntry(
                    message="CONNECTION LOST — EDGE ISOLATION MODE",
                    timestamp=_now_ms(),
                    severity="warning",
                ).model_dump(by_alias=True)
            )
            self.compaction_logs = self._trim_recent(self.compaction_logs, COMPACTION_LOG_LIMIT)

        self._publish_snapshot()

    def set_mesh_gateway_active(self, active: bool) -> None:
        self.mesh_gateway_active = active and not self.is_online
        if self.mesh_gateway_active:
            self.compaction_logs.append(
                CompactionLogEntry(
                    message="MESH GATEWAY OPEN — FAST DRAINING EDGE BUFFER OFFLINE",
                    timestamp=_now_ms(),
                    severity="sync",
                ).model_dump(by_alias=True)
            )
        else:
            self.compaction_logs.append(
                CompactionLogEntry(
                    message="MESH GATEWAY CLOSED",
                    timestamp=_now_ms(),
                    severity="info",
                ).model_dump(by_alias=True)
            )
        self.compaction_logs = self._trim_recent(self.compaction_logs, COMPACTION_LOG_LIMIT)
        self._publish_snapshot()

    def inject_anomaly(self, turbine_id: int) -> None:
        self.queued_anomaly_turbines.extend([turbine_id] * 5)

    def clear_anomaly(self, turbine_id: int) -> None:
        self.queued_anomaly_turbines = [
            queued_turbine
            for queued_turbine in self.queued_anomaly_turbines
            if queued_turbine != turbine_id
        ]


def _now_ms() -> int:
    return int(time.time() * 1000)


# Module-level singleton
engine = SimulationEngine()
