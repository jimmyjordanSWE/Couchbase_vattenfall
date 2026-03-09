import { create } from "zustand";
import type {
  EdgeGuardItem,
  DataPoint,
  Packet,
} from "~/types/edgeguard";
import type {
  SystemConfig,
  Metrics,
  EdgeUpdatePayload,
  CentralUpdatePayload,
  CompactionPayload,
  SnapshotPayload,
  SystemStatus,
  CompactionLogEntry as ApiCompactionLogEntry,
} from "~/lib/api";

export type CompactionLogEntry = ApiCompactionLogEntry;
export type SystemUiState = "boot" | "idle" | "running" | "clearing";

const MAX_PACKETS_IN_TRANSIT = 48;
const MESH_GATEWAY_BATCH_SIZE = 3;

export const EDGE_CAPACITY = 25;
export const COMPACTION_THRESHOLD = 18;

const DEFAULT_CONFIG: SystemConfig = {
  edgeCapacity: EDGE_CAPACITY,
  centralCapacity: 100,
  compactionThreshold: COMPACTION_THRESHOLD,
  turbineCount: 3,
  emitIntervalMs: 1000,
  drainIntervalMs: 600,
};

const DEFAULT_STATUS: SystemStatus = {
  isRunning: false,
  isInitialized: false,
  isOnline: true,
  isRecoverySyncActive: false,
  isMeshGatewayActive: false,
  sequenceNumber: 1000,
  enabledTurbines: [],
};

const DEFAULT_METRICS: Metrics = {
  totalPacketsEmitted: 0,
  totalAnomalies: 0,
  edgePressure: 0,
  compactionCount: 0,
  lastSyncTimestamp: null,
  edgeStorageLength: 0,
  centralStorageLength: 0,
};

function deriveSystemState({
  isInitialized,
  isRunning,
  isClearing,
}: {
  isInitialized: boolean;
  isRunning: boolean;
  isClearing: boolean;
}): SystemUiState {
  if (isClearing) return "clearing";
  if (isRunning) return "running";
  if (isInitialized) return "idle";
  return "boot";
}

export interface PipelineState {
  config: SystemConfig;
  status: SystemStatus;
  metrics: Metrics;
  systemState: SystemUiState;
  packetsInTransit: Packet[];
  edgeStorage: EdgeGuardItem[];
  centralStorage: EdgeGuardItem[];
  isOnline: boolean;
  isRunning: boolean;
  isInitialized: boolean;
  introComplete: boolean;
  compactionLogs: CompactionLogEntry[];
  compactionCount: number;
  forcedAnomalyTurbine: number | null;
  enabledTurbines: number[];

  perTurbineHistory: Record<number, DataPoint[]>;
  totalPacketsEmitted: number;
  totalAnomalies: number;
  lastSyncTimestamp: number | null;
  edgePressure: number;
  lastDrainedItemId: string | null;
  compactionFlashId: string | null;
  isClearing: boolean;
  meshGatewayOverride: boolean | null;

  // UI-only actions (kept local)
  initialize: () => void;
  beginClearing: () => void;
  finishClearing: () => void;
  clearPipelineData: () => void;
  completeIntro: () => void;
  removePacket: (id: string) => void;
  setMeshGatewayOverride: (active: boolean | null) => void;
  drainMeshGatewayOne: () => void;

  // Actions driven by SSE events from backend
  applyTelemetry: (point: DataPoint) => void;
  applyEdgeUpdate: (data: EdgeUpdatePayload) => void;
  applyCentralUpdate: (data: CentralUpdatePayload) => void;
  applyCompaction: (data: CompactionPayload) => void;
  applyMetrics: (data: Metrics) => void;
  applySystemStatus: (data: SystemStatus) => void;
  applySnapshot: (data: SnapshotPayload) => void;
  setCentralStorage: (items: EdgeGuardItem[]) => void;
  setEdgeStorage: (items: EdgeGuardItem[]) => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  config: DEFAULT_CONFIG,
  status: DEFAULT_STATUS,
  metrics: DEFAULT_METRICS,
  systemState: "boot",
  packetsInTransit: [],
  edgeStorage: [],
  centralStorage: [],
  isOnline: true,
  isRunning: false,
  isInitialized: false,
  introComplete: false,
  compactionLogs: [],
  compactionCount: 0,
  forcedAnomalyTurbine: null,
  enabledTurbines: [],  // default: all turbines off

  perTurbineHistory: { 1: [], 2: [], 3: [] },
  totalPacketsEmitted: 0,
  totalAnomalies: 0,
  lastSyncTimestamp: null,
  edgePressure: 0,
  lastDrainedItemId: null,
  compactionFlashId: null,
  isClearing: false,
  meshGatewayOverride: null,

  // ---- UI-only actions ----

  initialize: () =>
    set((s) => ({
      isInitialized: true,
      status: { ...s.status, isInitialized: true },
      systemState: deriveSystemState({
        isInitialized: true,
        isRunning: s.isRunning,
        isClearing: s.isClearing,
      }),
    })),
  beginClearing: () =>
    set((s) => ({
      isClearing: true,
      systemState: deriveSystemState({
        isInitialized: s.isInitialized,
        isRunning: s.isRunning,
        isClearing: true,
      }),
    })),
  finishClearing: () =>
    set((s) => ({
      isClearing: false,
      systemState: deriveSystemState({
        isInitialized: s.isInitialized,
        isRunning: s.isRunning,
        isClearing: false,
      }),
    })),
  clearPipelineData: () =>
    set((s) => ({
      packetsInTransit: [],
      edgeStorage: [],
      centralStorage: [],
      compactionLogs: [],
      compactionCount: 0,
      perTurbineHistory: { 1: [], 2: [], 3: [] },
      totalPacketsEmitted: 0,
      totalAnomalies: 0,
      lastSyncTimestamp: null,
      edgePressure: 0,
      lastDrainedItemId: null,
      compactionFlashId: null,
      metrics: {
        ...s.metrics,
        totalPacketsEmitted: 0,
        totalAnomalies: 0,
        edgePressure: 0,
        compactionCount: 0,
        lastSyncTimestamp: null,
        edgeStorageLength: 0,
        centralStorageLength: 0,
      },
      status: {
        ...s.status,
        isRunning: false,
        isInitialized: false,
        isOnline: true,
        isMeshGatewayActive: false,
        sequenceNumber: 1000,
        enabledTurbines: [],
      },
      isRunning: false,
      isInitialized: false,
      isOnline: true,
      enabledTurbines: [],
      forcedAnomalyTurbine: null,
      meshGatewayOverride: null,
      systemState: "boot",
    })),
  completeIntro: () => set({ introComplete: true }),
  setMeshGatewayOverride: (active) =>
    set((s) => ({
      meshGatewayOverride: active,
      status: active == null
        ? s.status
        : { ...s.status, isMeshGatewayActive: active },
    })),
  drainMeshGatewayOne: () =>
    set((s) => {
      if (s.edgeStorage.length === 0) return s;

      const movedItems = s.edgeStorage.slice(0, MESH_GATEWAY_BATCH_SIZE);
      const remainingEdge = s.edgeStorage.slice(movedItems.length);
      const timestamp = Date.now();
        const packets = movedItems.map((item, index) => {
        const stableId =
          "id" in item && typeof item.id === "string" && item.id.length > 0
            ? item.id
            : `mesh-${timestamp}-${index}`;

        return {
          id: `mesh-to-cloud:${stableId}:${timestamp}:${index}`,
          segment: "mesh-to-cloud" as const,
          createdAt: timestamp + index * 40,
          durationMs: 300,
          payload: item,
        };
      });

      return {
        edgeStorage: remainingEdge,
        centralStorage: [...s.centralStorage, ...movedItems],
        lastSyncTimestamp: timestamp,
        edgePressure: remainingEdge.length / Math.max(s.config.edgeCapacity ?? EDGE_CAPACITY, 1),
        metrics: {
          ...s.metrics,
          lastSyncTimestamp: timestamp,
          edgeStorageLength: remainingEdge.length,
          centralStorageLength: s.centralStorage.length + movedItems.length,
        },
        packetsInTransit: [
          ...s.packetsInTransit,
          ...packets,
        ].slice(-MAX_PACKETS_IN_TRANSIT),
      };
    }),

  removePacket: (id) =>
    set((s) => ({
      packetsInTransit: s.packetsInTransit.filter((p) => p.id !== id),
    })),

  // ---- SSE event handlers ----

  applyTelemetry: (point) =>
    set((s) => {
      const history = { ...s.perTurbineHistory };
      const turbineHist = [...(history[point.sourceTurbine] || []), point];
      if (turbineHist.length > 30) turbineHist.shift();
      history[point.sourceTurbine] = turbineHist;

      return {
        packetsInTransit: [
          ...s.packetsInTransit,
          {
            id: `to-buffer:${point.id}:${Date.now()}`,
            segment: "to-buffer" as const,
            createdAt: Date.now(),
            durationMs: 1100,
            payload: point,
          },
        ].slice(-MAX_PACKETS_IN_TRANSIT),
        perTurbineHistory: history,
      };
    }),

  // Updates edge only; never touches central.
  applyEdgeUpdate: (data) =>
    set((s) => {
      const id = "id" in data.item ? (data.item as DataPoint).id : undefined;
      const prev = s.edgeStorage;
      const idx = id != null ? prev.findIndex((x) => "id" in x && (x as DataPoint).id === id) : -1;
      const next =
        data.edgeStorage ?? (
          idx >= 0
            ? prev.map((x, i) => (i === idx ? data.item : x))
            : [...prev.slice(-((s.config.edgeCapacity ?? EDGE_CAPACITY) - 1)), data.item]
        );
      return {
        edgeStorage: next,
        edgePressure: data.pressure,
        metrics: {
          ...s.metrics,
          edgePressure: data.pressure,
          edgeStorageLength: data.storageLength,
        },
      };
    }),

  // Central updates are authoritative; backend sends the exact edge and central arrays.
  applyCentralUpdate: (data) =>
    set((s) => {
      const id =
        "id" in data.item
          ? (data.item as DataPoint).id
          : `drain_${Date.now()}`;
      return {
        centralStorage: data.centralStorage,
        lastSyncTimestamp: data.lastSyncTimestamp,
        lastDrainedItemId: id,
        edgeStorage: data.edgeStorage,
        edgePressure: data.pressure,
        metrics: {
          ...s.metrics,
          lastSyncTimestamp: data.lastSyncTimestamp,
          edgeStorageLength: data.edgeStorage.length,
          centralStorageLength: data.centralStorage.length,
        },
        packetsInTransit: [
          ...s.packetsInTransit,
          {
            id: `to-central:${id}:${Date.now()}`,
            segment: "to-central" as const,
            createdAt: Date.now(),
            durationMs: 900,
            payload: data.item,
          },
        ].slice(-MAX_PACKETS_IN_TRANSIT),
      };
    }),

  applyCompaction: (data) =>
    set((s) => ({
      edgeStorage: data.edgeStorage,
      compactionLogs: [...get().compactionLogs, data.log],
      compactionCount: data.compactionCount,
      compactionFlashId: `compact_${Date.now()}`,
      edgePressure: data.pressure,
      metrics: {
        ...s.metrics,
        compactionCount: data.compactionCount,
        edgePressure: data.pressure,
        edgeStorageLength: data.edgeStorage.length,
      },
    })),

  applyMetrics: (data) =>
    set((s) => ({
      totalPacketsEmitted: data.totalPacketsEmitted,
      totalAnomalies: data.totalAnomalies,
      edgePressure: data.edgePressure,
      compactionCount: data.compactionCount,
      lastSyncTimestamp: data.lastSyncTimestamp,
      metrics: data,
      config: {
        ...s.config,
        centralCapacity: Math.max(s.config.centralCapacity ?? 100, data.centralStorageLength),
      },
    })),

  applySystemStatus: (data) =>
    set((s) => ({
      isRunning: data.isRunning,
      isOnline: data.isOnline,
      isInitialized: data.isInitialized,
      enabledTurbines: data.enabledTurbines ?? [],
      status: {
        ...s.status,
        ...data,
        isRecoverySyncActive: data.isRecoverySyncActive ?? false,
        isMeshGatewayActive: data.isMeshGatewayActive ?? false,
      },
      systemState: deriveSystemState({
        isInitialized: data.isInitialized,
        isRunning: data.isRunning,
        isClearing: s.isClearing,
      }),
    })),

  // Snapshot: set edge and central only from backend edgeStorage/centralStorage; do not derive one from the other.
  applySnapshot: (data) =>
    set((s) => {
      const nextStatus: SystemStatus = {
        ...s.status,
        ...(data.systemStatus ?? {}),
        isRecoverySyncActive: data.systemStatus?.isRecoverySyncActive ?? s.status.isRecoverySyncActive ?? false,
        isMeshGatewayActive: data.systemStatus?.isMeshGatewayActive ?? s.status.isMeshGatewayActive ?? false,
      };
      const nextMetrics: Metrics = {
        ...s.metrics,
        ...(data.metrics ?? {}),
      };

      return {
        packetsInTransit: [],
        edgeStorage: data.edgeStorage ?? [],
        centralStorage: data.centralStorage ?? [],
        compactionLogs: data.compactionLogs ?? [],
        compactionCount: data.compactionCount ?? 0,
        totalPacketsEmitted: nextMetrics.totalPacketsEmitted,
        totalAnomalies: nextMetrics.totalAnomalies,
        edgePressure: nextMetrics.edgePressure,
        lastSyncTimestamp: nextMetrics.lastSyncTimestamp,
        isRunning: nextStatus.isRunning,
        isOnline: nextStatus.isOnline,
        isInitialized: nextStatus.isInitialized,
        enabledTurbines: nextStatus.enabledTurbines ?? [],
        status: nextStatus,
        metrics: {
          ...nextMetrics,
          edgeStorageLength: nextMetrics.edgeStorageLength || data.edgeStorage?.length || 0,
          centralStorageLength: nextMetrics.centralStorageLength || data.centralStorage?.length || 0,
        },
        config: {
          ...s.config,
          edgeCapacity: s.config.edgeCapacity ?? EDGE_CAPACITY,
          centralCapacity: Math.max(
            s.config.centralCapacity ?? 100,
            nextMetrics.centralStorageLength || data.centralStorage?.length || 0,
          ),
        },
        systemState: deriveSystemState({
          isInitialized: nextStatus.isInitialized,
          isRunning: nextStatus.isRunning,
          isClearing: s.isClearing,
        }),
      };
    }),

  setCentralStorage: (items) =>
    set((s) => ({
      centralStorage: items,
      metrics: {
        ...s.metrics,
        centralStorageLength: Math.max(s.metrics.centralStorageLength, items.length),
      },
    })),
  setEdgeStorage: (items) =>
    set((s) => ({
      edgeStorage: items,
      metrics: {
        ...s.metrics,
        edgeStorageLength: items.length,
      },
    })),
}));
