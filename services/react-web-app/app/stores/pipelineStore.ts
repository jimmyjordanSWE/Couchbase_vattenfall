import { create } from "zustand";
import type { EdgeGuardItem, DataPoint, CompactedBlock } from "~/types/edgeguard";
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

export type EdgeItemKind = "normal" | "anomaly" | "compacted";
export type TransitChannel = "ingest" | "cloud" | "mesh";

export interface TransitEntity {
  id: string;
  channel: TransitChannel;
  kind: EdgeItemKind;
  turbineId?: number;
}

interface PendingOutboundHandoff {
  entityId: string;
  channel: "cloud" | "mesh";
  item: EdgeGuardItem;
  durationMs: number;
}

export const CLOUD_SYNC_INTERVAL_MS = 120;
export const RECOVERY_DRAIN_MULTIPLIER = 5;
export const RECOVERY_SYNC_INTERVAL_MS =
  CLOUD_SYNC_INTERVAL_MS / RECOVERY_DRAIN_MULTIPLIER;
export const EDGE_CAPACITY = 100;
export const COMPACTION_THRESHOLD = 80;
export const INGEST_TRANSIT_MS = 2200;
export const CLOUD_TRANSIT_MS = 900;
export const MESH_TRANSIT_MS = 900;

function isDataPoint(item: EdgeGuardItem): item is DataPoint {
  return "id" in item && "anomalyScore" in item;
}

function isCompactedBlock(item: EdgeGuardItem): item is CompactedBlock {
  return item.type === "compacted";
}

function getItemKind(item: EdgeGuardItem): EdgeItemKind {
  if (isCompactedBlock(item)) return "compacted";
  return item.type;
}

function getRuntimeItemId(item: EdgeGuardItem): string {
  if (isDataPoint(item)) return item.id;
  return `compacted_${item.range}_${item.tier}`;
}

function countAnomalies(items: EdgeGuardItem[]) {
  return items.filter((item) => isDataPoint(item) && item.type === "anomaly").length;
}

function findMeshDrainIndex(items: EdgeGuardItem[]) {
  const anomalyIndex = items.findIndex((item) => getItemKind(item) === "anomaly");
  if (anomalyIndex >= 0) return anomalyIndex;

  const normalIndex = items.findIndex((item) => getItemKind(item) === "normal");
  if (normalIndex >= 0) return normalIndex;

  return 0;
}

type PendingItems = Record<string, EdgeGuardItem>;
type PendingOutboundHandshakes = Record<string, PendingOutboundHandoff>;

function scheduleOutboundCompletion(
  channel: "cloud" | "mesh",
  durationMs: number,
  entityId: string,
  getState: () => PipelineState,
) {
  scheduleStoreAction(durationMs, () => {
    if (channel === "cloud") {
      getState().completeCloudTransit(entityId);
      return;
    }
    getState().completeMeshTransit(entityId);
  });
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

  perTurbineHistory: Record<number, DataPoint[]>;
  totalPacketsEmitted: number;
  totalAnomalies: number;
  lastSyncTimestamp: number | null;
  edgePressure: number;
  lastDrainedItemId: string | null;
  compactionFlashId: string | null;

  ingestEntities: TransitEntity[];
  cloudEntities: TransitEntity[];
  meshEntities: TransitEntity[];
  pendingEdgeArrivals: PendingItems;
  pendingCloudCompletions: PendingItems;
  pendingMeshCompletions: PendingItems;
  pendingOutboundHandshakes: PendingOutboundHandshakes;
  visualEdgeTotalCount: number;
  visualEdgeAnomalyCount: number;
  visualCentralCount: number;

  initialize: () => void;
  beginClearing: () => void;
  finishClearing: () => void;
  completeIntro: () => void;
  clearPipelineData: () => void;
  advanceTransit: (delta: number) => void;
  toggleMeshUnload: () => void;
  drainMeshStep: () => void;
  completeIngestTransit: (entityId: string) => void;
  completeCloudTransit: (entityId: string) => void;
  completeMeshTransit: (entityId: string) => void;

  applyTelemetry: (point: DataPoint) => void;
  applyEdgeUpdate: (data: EdgeUpdatePayload) => void;
  applyCentralUpdate: (data: CentralUpdatePayload) => void;
  applyCompaction: (data: CompactionPayload) => void;
  applyMetrics: (data: Metrics) => void;
  applySystemStatus: (data: SystemStatus) => void;
}

function scheduleStoreAction(delayMs: number, action: () => void) {
  globalThis.setTimeout(action, delayMs);
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

  perTurbineHistory: { 1: [], 2: [], 3: [] },
  totalPacketsEmitted: 0,
  totalAnomalies: 0,
  lastSyncTimestamp: null,
  edgePressure: 0,
  lastDrainedItemId: null,
  compactionFlashId: null,

  ingestEntities: [],
  cloudEntities: [],
  meshEntities: [],
  pendingEdgeArrivals: {},
  pendingCloudCompletions: {},
  pendingMeshCompletions: {},
  pendingOutboundHandshakes: {},
  visualEdgeTotalCount: 0,
  visualEdgeAnomalyCount: 0,
  visualCentralCount: 0,

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
      perTurbineHistory: { 1: [], 2: [], 3: [] },
      totalPacketsEmitted: 0,
      totalAnomalies: 0,
      lastSyncTimestamp: null,
      edgePressure: 0,
      lastDrainedItemId: null,
      compactionFlashId: null,
      ingestEntities: [],
      cloudEntities: [],
      meshEntities: [],
      pendingEdgeArrivals: {},
      pendingCloudCompletions: {},
      pendingMeshCompletions: {},
      pendingOutboundHandshakes: {},
      visualEdgeTotalCount: 0,
      visualEdgeAnomalyCount: 0,
      visualCentralCount: 0,
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

      const meshDrainIndex = findMeshDrainIndex(s.edgeStorage);
      const item = s.edgeStorage[meshDrainIndex];
      const itemId = getRuntimeItemId(item);
      const entityId = `mesh_${getRuntimeItemId(item)}_${Date.now()}`;
      const nextEdgeStorage = s.edgeStorage.filter((_, index) => index !== meshDrainIndex);
      const nextPressure = nextEdgeStorage.length >= COMPACTION_THRESHOLD * 0.5
        ? Math.min(
            1,
            (nextEdgeStorage.length - COMPACTION_THRESHOLD * 0.5) /
              (EDGE_CAPACITY - COMPACTION_THRESHOLD * 0.5),
          )
        : 0;

      const pendingOutboundHandshakes = { ...s.pendingOutboundHandshakes };
      let meshEntities = s.meshEntities;
      let pendingMeshCompletions = s.pendingMeshCompletions;

      if (s.pendingEdgeArrivals[itemId]) {
        pendingOutboundHandshakes[itemId] = {
          entityId,
          channel: "mesh",
          item,
          durationMs: MESH_TRANSIT_MS,
        };
      } else {
        meshEntities = [
          ...s.meshEntities,
          {
            id: entityId,
            channel: "mesh",
            kind: getItemKind(item),
          },
        ];
        pendingMeshCompletions = {
          ...s.pendingMeshCompletions,
          [entityId]: item,
        };
        scheduleOutboundCompletion("mesh", MESH_TRANSIT_MS, entityId, get);
      }

      return {
        edgeStorage: nextEdgeStorage,
        edgePressure: nextPressure,
        meshEntities,
        pendingMeshCompletions,
        pendingOutboundHandshakes,
        transportState: nextEdgeStorage.length > 0 ? "offline_mesh_unloading" : "offline_buffering",
      };
    }),

  completeIngestTransit: (entityId) =>
    set((s) => {
      const item = s.pendingEdgeArrivals[entityId];
      const ingestEntities = s.ingestEntities.filter((entity) => entity.id !== entityId);
      if (!item) {
        return { ingestEntities };
      }

      const pendingEdgeArrivals = { ...s.pendingEdgeArrivals };
      delete pendingEdgeArrivals[entityId];

      const pendingOutboundHandshakes = { ...s.pendingOutboundHandshakes };
      const deferredOutbound = pendingOutboundHandshakes[entityId];
      if (deferredOutbound) {
        delete pendingOutboundHandshakes[entityId];
      }

      let cloudEntities = s.cloudEntities;
      let meshEntities = s.meshEntities;
      let pendingCloudCompletions = s.pendingCloudCompletions;
      let pendingMeshCompletions = s.pendingMeshCompletions;

      if (deferredOutbound?.channel === "cloud") {
        cloudEntities = [
          ...s.cloudEntities,
          {
            id: deferredOutbound.entityId,
            channel: "cloud",
            kind: getItemKind(deferredOutbound.item),
          },
        ];
        pendingCloudCompletions = {
          ...s.pendingCloudCompletions,
          [deferredOutbound.entityId]: deferredOutbound.item,
        };
        scheduleOutboundCompletion("cloud", deferredOutbound.durationMs, deferredOutbound.entityId, get);
      }

      if (deferredOutbound?.channel === "mesh") {
        meshEntities = [
          ...s.meshEntities,
          {
            id: deferredOutbound.entityId,
            channel: "mesh",
            kind: getItemKind(deferredOutbound.item),
          },
        ];
        pendingMeshCompletions = {
          ...s.pendingMeshCompletions,
          [deferredOutbound.entityId]: deferredOutbound.item,
        };
        scheduleOutboundCompletion("mesh", deferredOutbound.durationMs, deferredOutbound.entityId, get);
      }

      return {
        ingestEntities,
        pendingEdgeArrivals,
        pendingOutboundHandshakes,
        cloudEntities,
        meshEntities,
        pendingCloudCompletions,
        pendingMeshCompletions,
        visualEdgeTotalCount: s.visualEdgeTotalCount + 1,
        visualEdgeAnomalyCount:
          getItemKind(item) === "anomaly"
            ? s.visualEdgeAnomalyCount + 1
            : s.visualEdgeAnomalyCount,
      };
    }),

  completeCloudTransit: (entityId) =>
    set((s) => {
      const item = s.pendingCloudCompletions[entityId];
      const cloudEntities = s.cloudEntities.filter((entity) => entity.id !== entityId);
      if (!item) {
        return { cloudEntities };
      }

      const pendingCloudCompletions = { ...s.pendingCloudCompletions };
      delete pendingCloudCompletions[entityId];
      const itemKind = getItemKind(item);

      return {
        cloudEntities,
        pendingCloudCompletions,
        visualEdgeTotalCount: Math.max(0, s.visualEdgeTotalCount - 1),
        visualEdgeAnomalyCount:
          itemKind === "anomaly"
            ? Math.max(0, s.visualEdgeAnomalyCount - 1)
            : s.visualEdgeAnomalyCount,
        visualCentralCount: s.visualCentralCount + 1,
      };
    }),

  completeMeshTransit: (entityId) =>
    set((s) => {
      const item = s.pendingMeshCompletions[entityId];
      const meshEntities = s.meshEntities.filter((entity) => entity.id !== entityId);
      if (!item) {
        return { meshEntities };
      }

      const pendingMeshCompletions = { ...s.pendingMeshCompletions };
      delete pendingMeshCompletions[entityId];
      const itemKind = getItemKind(item);

      return {
        meshEntities,
        pendingMeshCompletions,
        visualEdgeTotalCount: Math.max(0, s.visualEdgeTotalCount - 1),
        visualEdgeAnomalyCount:
          itemKind === "anomaly"
            ? Math.max(0, s.visualEdgeAnomalyCount - 1)
            : s.visualEdgeAnomalyCount,
      };
    }),

  applyTelemetry: (point) =>
    set((s) => {
      const history = { ...s.perTurbineHistory };
      const turbineHist = [...(history[point.sourceTurbine] || []), point];
      if (turbineHist.length > 30) turbineHist.shift();
      history[point.sourceTurbine] = turbineHist;

      const entity: TransitEntity = {
        id: point.id,
        channel: "ingest",
        kind: point.type,
        turbineId: point.sourceTurbine,
      };

      scheduleStoreAction(INGEST_TRANSIT_MS, () => {
        get().completeIngestTransit(point.id);
      });

      return {
        perTurbineHistory: history,
        totalPacketsEmitted: s.totalPacketsEmitted + 1,
        totalAnomalies: s.totalAnomalies + (point.type === "anomaly" ? 1 : 0),
        ingestEntities: [...s.ingestEntities, entity],
      };
    }),

  applyEdgeUpdate: (data) =>
    set((s) => ({
      edgeStorage: [...s.edgeStorage.slice(-(EDGE_CAPACITY - 1)), data.item],
      edgePressure: data.pressure,
      pendingEdgeArrivals: {
        ...s.pendingEdgeArrivals,
        [getRuntimeItemId(data.item)]: data.item,
      },
    })),

  applyCentralUpdate: (data) =>
    set((s) => {
      const entityId = `cloud_${getRuntimeItemId(data.item)}_${Date.now()}`;
      const itemId = getRuntimeItemId(data.item);
      const duration =
        s.transportState === "online_recovery"
          ? RECOVERY_SYNC_INTERVAL_MS * 6
          : CLOUD_TRANSIT_MS;
      const pendingOutboundHandshakes = { ...s.pendingOutboundHandshakes };
      let cloudEntities = s.cloudEntities;
      let pendingCloudCompletions = s.pendingCloudCompletions;

      if (s.pendingEdgeArrivals[itemId]) {
        pendingOutboundHandshakes[itemId] = {
          entityId,
          channel: "cloud",
          item: data.item,
          durationMs: duration,
        };
      } else {
        cloudEntities = [
          ...s.cloudEntities,
          {
            id: entityId,
            channel: "cloud",
            kind: getItemKind(data.item),
          },
        ];
        pendingCloudCompletions = {
          ...s.pendingCloudCompletions,
          [entityId]: data.item,
        };
        scheduleOutboundCompletion("cloud", duration, entityId, get);
      }

      return {
        centralStorage: [...s.centralStorage, data.item],
        lastSyncTimestamp: data.lastSyncTimestamp,
        lastDrainedItemId: entityId,
        edgeStorage: s.edgeStorage.slice(1),
        edgePressure: Math.max(0, s.edgePressure - 0.04),
        cloudEntities,
        pendingCloudCompletions,
        pendingOutboundHandshakes,
      };
    }),

  applyCompaction: (data) =>
    set((s) => {
      const arrivedEdgeIds = new Set(Object.keys(s.pendingEdgeArrivals));
      const snapshotPointIds = new Set(
        data.edgeStorage
          .filter((item): item is DataPoint => isDataPoint(item))
          .map((item) => item.id),
      );

      return {
        edgeStorage: data.edgeStorage,
        compactionLogs: [...s.compactionLogs, data.log],
        compactionCount: data.compactionCount,
        compactionFlashId: `compact_${Date.now()}`,
        visualEdgeTotalCount: data.edgeStorage.length,
        visualEdgeAnomalyCount: countAnomalies(data.edgeStorage),
        pendingEdgeArrivals: {},
        pendingOutboundHandshakes: {},
        ingestEntities: s.ingestEntities.filter(
          (entity) => !arrivedEdgeIds.has(entity.id) && !snapshotPointIds.has(entity.id),
        ),
      };
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
      systemState: data.isRunning
        ? "running"
        : data.isInitialized
          ? s.systemState === "clearing"
            ? "clearing"
            : "idle"
          : "boot",
      transportState: data.isOnline
        ? data.isRecoverySyncActive
          ? "online_recovery"
          : "online_steady"
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
export const selectCanToggleLink = (s: PipelineState) =>
  s.systemState === "running" || s.systemState === "idle";
export const selectCanMeshUnload = (s: PipelineState) =>
  s.transportState === "offline_buffering" || s.transportState === "offline_mesh_unloading";
