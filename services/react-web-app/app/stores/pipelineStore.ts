import { create } from "zustand";
import type {
  EdgeGuardItem,
  DataPoint,
  CompactedBlock,
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

export const EDGE_CAPACITY = 100;
export const COMPACTION_THRESHOLD = 80;

export interface PipelineState {
  edgeStorage: EdgeGuardItem[];
  centralStorage: EdgeGuardItem[];
  isOnline: boolean;
  isRunning: boolean;
  isRecoverySyncActive: boolean;
  isInitialized: boolean;
  introComplete: boolean;
  compactionLogs: CompactionLogEntry[];
  compactionCount: number;
  forcedAnomalyTurbine: number | null;

  perTurbineHistory: Record<number, DataPoint[]>;
  totalPacketsEmitted: number;
  totalAnomalies: number;
  lastSyncTimestamp: number | null;
  edgePressure: number;
  lastDrainedItemId: string | null;
  compactionFlashId: string | null;

  // UI-only actions (kept local)
  initialize: () => void;
  completeIntro: () => void;
  clearPipelineData: () => void;
  advanceTransit: (delta: number) => void;

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
  isOnline: true,
  isRunning: false,
  isRecoverySyncActive: false,
  isInitialized: false,
  introComplete: false,
  compactionLogs: [],
  compactionCount: 0,
  forcedAnomalyTurbine: null,

  perTurbineHistory: { 1: [], 2: [], 3: [] },
  totalPacketsEmitted: 0,
  totalAnomalies: 0,
  lastSyncTimestamp: null,
  edgePressure: 0,
  lastDrainedItemId: null,
  compactionFlashId: null,

  // ---- UI-only actions ----

  initialize: () => set({ isInitialized: true }),
  completeIntro: () => set({ introComplete: true }),
  clearPipelineData: () =>
    set((s) => ({
      edgeStorage: [],
      centralStorage: [],
      compactionLogs: [],
      compactionCount: 0,
      forcedAnomalyTurbine: null,
      perTurbineHistory: { 1: [], 2: [], 3: [] },
      totalPacketsEmitted: 0,
      totalAnomalies: 0,
      lastSyncTimestamp: null,
      edgePressure: 0,
      lastDrainedItemId: null,
      compactionFlashId: null,
      isRunning: s.isRunning,
      isOnline: s.isOnline,
      isRecoverySyncActive: s.isRecoverySyncActive,
      isInitialized: s.isInitialized,
      introComplete: s.introComplete,
    })),

  advanceTransit: (delta) => {
    void delta;
  },

  // ---- SSE event handlers ----

  applyTelemetry: (point) =>
    set((s) => {
      const history = { ...s.perTurbineHistory };
      const turbineHist = [...(history[point.sourceTurbine] || []), point];
      if (turbineHist.length > 30) turbineHist.shift();
      history[point.sourceTurbine] = turbineHist;

      return {
        perTurbineHistory: history,
        totalPacketsEmitted: s.totalPacketsEmitted + 1,
        totalAnomalies: s.totalAnomalies + (point.type === "anomaly" ? 1 : 0),
      };
    }),

  applyEdgeUpdate: (data) =>
    set({
      edgeStorage: [...get().edgeStorage.slice(-(EDGE_CAPACITY - 1)), data.item],
      edgePressure: data.pressure,
    }),

  applyCentralUpdate: (data) =>
    set((s) => {
      const id =
        "id" in data.item
          ? (data.item as DataPoint).id
          : `drain_${Date.now()}`;
      return {
        centralStorage: [...s.centralStorage, data.item],
        lastSyncTimestamp: data.lastSyncTimestamp,
        lastDrainedItemId: id,
        edgeStorage: s.edgeStorage.slice(1),
        edgePressure: Math.max(0, s.edgePressure - 0.04),
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
    set({
      isRunning: data.isRunning,
      isOnline: data.isOnline,
      isRecoverySyncActive: data.isRecoverySyncActive,
      isInitialized: data.isInitialized,
    }),
}));
