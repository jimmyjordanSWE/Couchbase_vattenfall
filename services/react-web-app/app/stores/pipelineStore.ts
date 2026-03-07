import { create } from "zustand";
import type {
  EdgeGuardItem,
  DataPoint,
} from "~/types/edgeguard";
import type {
  Metrics,
  EdgeUpdatePayload,
  CentralUpdatePayload,
  CompactionPayload,
  SystemStatus,
  CompactionLogEntry as ApiCompactionLogEntry,
} from "~/lib/api";

export type CompactionLogEntry = ApiCompactionLogEntry;
export type SystemUiState = "boot" | "idle" | "running" | "clearing";
export type TransportUiState =
  | "online_steady"
  | "online_recovery"
  | "offline_buffering"
  | "offline_mesh_unloading";

export const CLOUD_SYNC_INTERVAL_MS = 120;
export const RECOVERY_DRAIN_MULTIPLIER = 5;
export const RECOVERY_SYNC_INTERVAL_MS =
  CLOUD_SYNC_INTERVAL_MS / RECOVERY_DRAIN_MULTIPLIER;
export const EDGE_CAPACITY = 100;
export const COMPACTION_THRESHOLD = 80;
export const ANOMALY_PIPELINE_TRAVEL_MS = 2200;

export interface AnomalyTransitToken {
  id: string;
  turbineId: number;
}

function isAnomalyItem(item: EdgeGuardItem | undefined): item is DataPoint {
  return !!item && "type" in item && item.type === "anomaly";
}

function consumeVisualAnomalyCounts(
  visualEdgeAnomalyCount: number,
  pendingVisualEdgeAnomalyArrivals: number,
) {
  if (visualEdgeAnomalyCount > 0) {
    return {
      visualEdgeAnomalyCount: visualEdgeAnomalyCount - 1,
      pendingVisualEdgeAnomalyArrivals,
    };
  }

  if (pendingVisualEdgeAnomalyArrivals > 0) {
    return {
      visualEdgeAnomalyCount,
      pendingVisualEdgeAnomalyArrivals: pendingVisualEdgeAnomalyArrivals - 1,
    };
  }

  return {
    visualEdgeAnomalyCount,
    pendingVisualEdgeAnomalyArrivals,
  };
}

export interface PipelineState {
  edgeStorage: EdgeGuardItem[];
  centralStorage: EdgeGuardItem[];
  systemState: SystemUiState;
  transportState: TransportUiState;
  isInitialized: boolean;
  introComplete: boolean;
  compactionLogs: CompactionLogEntry[];
  compactionCount: number;
  anomalyTransitTokens: AnomalyTransitToken[];

  perTurbineHistory: Record<number, DataPoint[]>;
  totalPacketsEmitted: number;
  totalAnomalies: number;
  lastSyncTimestamp: number | null;
  edgePressure: number;
  visualEdgeAnomalyCount: number;
  pendingVisualEdgeAnomalyArrivals: number;
  lastDrainedItemId: string | null;
  compactionFlashId: string | null;

  // UI-only actions (kept local)
  initialize: () => void;
  beginClearing: () => void;
  finishClearing: () => void;
  completeIntro: () => void;
  clearPipelineData: () => void;
  advanceTransit: (delta: number) => void;
  toggleMeshUnload: () => void;
  drainMeshStep: () => void;
  completeAnomalyTransit: (tokenId: string) => void;

  // Actions driven by SSE events from backend
  applyTelemetry: (point: DataPoint) => void;
  applyEdgeUpdate: (data: EdgeUpdatePayload) => void;
  applyCentralUpdate: (data: CentralUpdatePayload) => void;
  applyCompaction: (data: CompactionPayload) => void;
  applyMetrics: (data: Metrics) => void;
  applySystemStatus: (data: SystemStatus) => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  edgeStorage: [],
  centralStorage: [],
  systemState: "boot",
  transportState: "online_steady",
  isInitialized: false,
  introComplete: false,
  compactionLogs: [],
  compactionCount: 0,
  anomalyTransitTokens: [],

  perTurbineHistory: { 1: [], 2: [], 3: [] },
  totalPacketsEmitted: 0,
  totalAnomalies: 0,
  lastSyncTimestamp: null,
  edgePressure: 0,
  visualEdgeAnomalyCount: 0,
  pendingVisualEdgeAnomalyArrivals: 0,
  lastDrainedItemId: null,
  compactionFlashId: null,

  // ---- UI-only actions ----

  initialize: () => set({ isInitialized: true, systemState: "idle" }),
  beginClearing: () => set({ systemState: "clearing" }),
  finishClearing: () =>
    set((s) => ({
      systemState: s.isInitialized ? "idle" : "boot",
    })),
  completeIntro: () => set({ introComplete: true }),
  clearPipelineData: () =>
    set((s) => ({
      edgeStorage: [],
      centralStorage: [],
      compactionLogs: [],
      compactionCount: 0,
      anomalyTransitTokens: [],
      perTurbineHistory: { 1: [], 2: [], 3: [] },
      totalPacketsEmitted: 0,
      totalAnomalies: 0,
      lastSyncTimestamp: null,
      edgePressure: 0,
      visualEdgeAnomalyCount: 0,
      pendingVisualEdgeAnomalyArrivals: 0,
      lastDrainedItemId: null,
      compactionFlashId: null,
      systemState: s.systemState === "clearing" ? "clearing" : s.systemState,
      transportState:
        s.transportState === "offline_mesh_unloading"
          ? "offline_buffering"
          : s.transportState,
      isInitialized: s.isInitialized,
      introComplete: s.introComplete,
    })),

  advanceTransit: (delta) => {
    void delta;
  },

  completeAnomalyTransit: (tokenId) =>
    set((s) => {
      const tokenExists = s.anomalyTransitTokens.some((token) => token.id === tokenId);
      if (!tokenExists) {
        return {};
      }

      return {
        anomalyTransitTokens: s.anomalyTransitTokens.filter((token) => token.id !== tokenId),
        visualEdgeAnomalyCount:
          s.pendingVisualEdgeAnomalyArrivals > 0
            ? s.visualEdgeAnomalyCount + 1
            : s.visualEdgeAnomalyCount,
        pendingVisualEdgeAnomalyArrivals:
          s.pendingVisualEdgeAnomalyArrivals > 0
            ? s.pendingVisualEdgeAnomalyArrivals - 1
            : 0,
      };
    }),

  toggleMeshUnload: () =>
    set((s) => ({
      transportState:
        s.transportState === "offline_mesh_unloading"
          ? "offline_buffering"
          : s.transportState === "offline_buffering" && s.edgeStorage.length > 0
            ? "offline_mesh_unloading"
            : s.transportState,
    })),

  drainMeshStep: () =>
    set((s) => {
      if (s.transportState !== "offline_mesh_unloading" || s.edgeStorage.length === 0) {
        return s.transportState === "offline_mesh_unloading"
          ? { transportState: "offline_buffering" }
          : {};
      }

      const removedItem = s.edgeStorage[0];
      const nextEdgeStorage = s.edgeStorage.slice(1);
      const nextPressure = nextEdgeStorage.length >= COMPACTION_THRESHOLD * 0.5
        ? Math.min(1, (nextEdgeStorage.length - COMPACTION_THRESHOLD * 0.5) / (EDGE_CAPACITY - COMPACTION_THRESHOLD * 0.5))
        : 0;
      const nextVisualCounts = isAnomalyItem(removedItem)
        ? consumeVisualAnomalyCounts(
            s.visualEdgeAnomalyCount,
            s.pendingVisualEdgeAnomalyArrivals,
          )
        : {
            visualEdgeAnomalyCount: s.visualEdgeAnomalyCount,
            pendingVisualEdgeAnomalyArrivals: s.pendingVisualEdgeAnomalyArrivals,
          };

      return {
        edgeStorage: nextEdgeStorage,
        edgePressure: nextPressure,
        ...nextVisualCounts,
        transportState: nextEdgeStorage.length > 0 ? "offline_mesh_unloading" : "offline_buffering",
      };
    }),

  // ---- SSE event handlers ----

  applyTelemetry: (point) =>
    set((s) => {
      const history = { ...s.perTurbineHistory };
      const turbineHist = [...(history[point.sourceTurbine] || []), point];
      if (turbineHist.length > 30) turbineHist.shift();
      history[point.sourceTurbine] = turbineHist;
      const nextState: Partial<PipelineState> = {
        perTurbineHistory: history,
        totalPacketsEmitted: s.totalPacketsEmitted + 1,
        totalAnomalies: s.totalAnomalies + (point.type === "anomaly" ? 1 : 0),
      };

      if (point.type === "anomaly") {
        const tokenId = `anomaly_${point.id}_${point.timestamp}`;
        nextState.anomalyTransitTokens = [
          ...s.anomalyTransitTokens,
          { id: tokenId, turbineId: point.sourceTurbine },
        ];
        nextState.pendingVisualEdgeAnomalyArrivals =
          s.pendingVisualEdgeAnomalyArrivals + 1;

        globalThis.setTimeout(() => {
          get().completeAnomalyTransit(tokenId);
        }, ANOMALY_PIPELINE_TRAVEL_MS);
      }

      return nextState;
    }),

  applyEdgeUpdate: (data) =>
    set((s) => ({
      edgeStorage: [...s.edgeStorage.slice(-(EDGE_CAPACITY - 1)), data.item],
      edgePressure: data.pressure,
    })),

  applyCentralUpdate: (data) =>
    set((s) => {
      const id =
        "id" in data.item
          ? (data.item as DataPoint).id
          : `drain_${Date.now()}`;
      const nextVisualCounts = isAnomalyItem(data.item)
        ? consumeVisualAnomalyCounts(
            s.visualEdgeAnomalyCount,
            s.pendingVisualEdgeAnomalyArrivals,
          )
        : {
            visualEdgeAnomalyCount: s.visualEdgeAnomalyCount,
            pendingVisualEdgeAnomalyArrivals: s.pendingVisualEdgeAnomalyArrivals,
          };
      return {
        centralStorage: [...s.centralStorage, data.item],
        lastSyncTimestamp: data.lastSyncTimestamp,
        lastDrainedItemId: id,
        edgeStorage: s.edgeStorage.slice(1),
        edgePressure: Math.max(0, s.edgePressure - 0.04),
        ...nextVisualCounts,
      };
    }),

  applyCompaction: (data) =>
    set({
      edgeStorage: data.edgeStorage,
      compactionLogs: [...get().compactionLogs, data.log],
      compactionCount: data.compactionCount,
      compactionFlashId: `compact_${Date.now()}`,
    }),

  applyMetrics: (data) =>
    set({
      totalPacketsEmitted: data.totalPacketsEmitted,
      totalAnomalies: data.totalAnomalies,
      edgePressure: data.edgePressure,
      compactionCount: data.compactionCount,
      lastSyncTimestamp: data.lastSyncTimestamp,
    }),

  applySystemStatus: (data) =>
    set((s) => ({
      systemState: data.isRunning ? "running" : data.isInitialized ? (s.systemState === "clearing" ? "clearing" : "idle") : "boot",
      transportState: data.isOnline
        ? (data.isRecoverySyncActive ? "online_recovery" : "online_steady")
        : s.transportState === "offline_mesh_unloading"
          ? "offline_mesh_unloading"
          : "offline_buffering",
      isInitialized: data.isInitialized,
    })),
}));

export const selectIsRunning = (s: PipelineState) => s.systemState === "running";
export const selectIsOnline = (s: PipelineState) => s.transportState.startsWith("online");
export const selectIsRecoverySyncActive = (s: PipelineState) => s.transportState === "online_recovery";
export const selectIsMeshUnloadActive = (s: PipelineState) => s.transportState === "offline_mesh_unloading";
export const selectCanStart = (s: PipelineState) => s.systemState === "idle";
export const selectCanStop = (s: PipelineState) => s.systemState === "running";
export const selectCanClear = (s: PipelineState) => s.systemState !== "clearing";
export const selectCanToggleLink = (s: PipelineState) => s.systemState === "running" || s.systemState === "idle";
export const selectCanMeshUnload = (s: PipelineState) =>
  s.transportState === "offline_buffering" || s.transportState === "offline_mesh_unloading";
