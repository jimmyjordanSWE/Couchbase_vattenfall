import { create } from "zustand";
import type { DataPoint, EdgeGuardItem } from "~/types/edgeguard";
import type {
  CompactionLogEntry,
  Metrics,
  PipelineSnapshot,
  SystemConfig,
  SystemStatus,
} from "~/lib/api";

export type SystemUiState = "boot" | "idle" | "running" | "clearing";

interface PipelineState {
  config: SystemConfig;
  status: SystemStatus;
  metrics: Metrics;
  edgeStorage: EdgeGuardItem[];
  centralStorage: EdgeGuardItem[];
  perTurbineHistory: Record<number, DataPoint[]>;
  compactionLogs: CompactionLogEntry[];
  systemState: SystemUiState;
  isInitialized: boolean;
  introComplete: boolean;

  initialize: () => void;
  beginClearing: () => void;
  finishClearing: () => void;
  completeIntro: () => void;
  clearPipelineData: () => void;
  applySnapshot: (snapshot: PipelineSnapshot) => void;
}

const defaultConfig: SystemConfig = {
  edgeCapacity: 100,
  centralCapacity: 500,
  compactionThreshold: 80,
  turbineCount: 3,
  emitIntervalMs: 140,
  drainIntervalMs: 120,
};

const defaultStatus: SystemStatus = {
  isRunning: false,
  isInitialized: false,
  isOnline: true,
  isRecoverySyncActive: false,
  isMeshGatewayActive: false,
  sequenceNumber: 1000,
};

const defaultMetrics: Metrics = {
  totalPacketsEmitted: 0,
  totalAnomalies: 0,
  edgePressure: 0,
  compactionCount: 0,
  lastSyncTimestamp: null,
  edgeStorageLength: 0,
  centralStorageLength: 0,
};

function deriveSystemState(status: SystemStatus, previous: SystemUiState): SystemUiState {
  if (status.isRunning) return "running";
  if (status.isInitialized) return previous === "clearing" ? "clearing" : "idle";
  return "boot";
}

export const usePipelineStore = create<PipelineState>((set) => ({
  config: defaultConfig,
  status: defaultStatus,
  metrics: defaultMetrics,
  edgeStorage: [],
  centralStorage: [],
  perTurbineHistory: { 1: [], 2: [], 3: [] },
  compactionLogs: [],
  systemState: "boot",
  isInitialized: false,
  introComplete: false,

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
      perTurbineHistory: { 1: [], 2: [], 3: [] },
      compactionLogs: [],
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
        sequenceNumber: 1000,
      },
    })),
  applySnapshot: (snapshot) =>
    set((s) => ({
      config: snapshot.config,
      status: snapshot.status,
      metrics: snapshot.metrics,
      edgeStorage: snapshot.edgeStorage,
      centralStorage: snapshot.centralStorage,
      perTurbineHistory: snapshot.perTurbineHistory,
      compactionLogs: snapshot.compactionLogs,
      isInitialized: snapshot.status.isInitialized,
      systemState: deriveSystemState(snapshot.status, s.systemState),
    })),
}));

export const selectIsRunning = (s: PipelineState) => s.status.isRunning;
export const selectIsOnline = (s: PipelineState) => s.status.isOnline;
export const selectIsRecoverySyncActive = (s: PipelineState) => s.status.isRecoverySyncActive;
export const selectIsMeshGatewayActive = (s: PipelineState) => s.status.isMeshGatewayActive;
export const selectCanStart = (s: PipelineState) => s.isInitialized && !s.status.isRunning && s.systemState !== "clearing";
export const selectCanStop = (s: PipelineState) => s.status.isRunning;
export const selectCanClear = (s: PipelineState) => s.systemState !== "clearing";
export const selectCanToggleLink = (s: PipelineState) =>
  s.systemState === "running" || s.systemState === "idle";
export const selectCanToggleMeshGateway = (s: PipelineState) =>
  (s.systemState === "running" || s.systemState === "idle") && !s.status.isOnline;
