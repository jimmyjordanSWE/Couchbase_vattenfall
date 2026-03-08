import type {
  DataPoint,
  EdgeGuardItem,
} from "~/types/edgeguard";

// ---------- Types matching backend Pydantic models ----------

export interface SystemConfig {
  edgeCapacity: number;
  centralCapacity: number;
  compactionThreshold: number;
  turbineCount: number;
  emitIntervalMs: number;
  drainIntervalMs: number;
}

export interface SystemStatus {
  isRunning: boolean;
  isInitialized: boolean;
  isOnline: boolean;
  isRecoverySyncActive: boolean;
  isMeshGatewayActive: boolean;
  sequenceNumber: number;
}

export interface ClearDatabaseResult {
  ok: boolean;
  edgeDeleted: number;
  centralDeleted: number;
}

export interface Metrics {
  totalPacketsEmitted: number;
  totalAnomalies: number;
  edgePressure: number;
  compactionCount: number;
  lastSyncTimestamp: number | null;
  edgeStorageLength: number;
  centralStorageLength: number;
}

export interface CompactionLogEntry {
  message: string;
  timestamp: number;
  severity: "compaction" | "sync" | "warning" | "info";
}

export interface PipelineSnapshot {
  config: SystemConfig;
  status: SystemStatus;
  metrics: Metrics;
  edgeStorage: EdgeGuardItem[];
  centralStorage: EdgeGuardItem[];
  perTurbineHistory: Record<number, DataPoint[]>;
  compactionLogs: CompactionLogEntry[];
}

// ---------- Base URL ----------
// In the browser, use relative URLs so requests go through the Vite proxy
// (which forwards /api/* to the FastAPI service inside the sandbox).
// For SSR, the env var resolves to the internal hostname.

const ENV_KEY = "VITE_PYTHON_FAST_API_CLIENT_URL";
const env = import.meta.env as Record<string, string | undefined>;
const IS_BROWSER = typeof window !== "undefined";
const BASE_URL = IS_BROWSER ? "" : (env[ENV_KEY] ?? "");

export function getBaseUrl(): string {
  return BASE_URL;
}

// ---------- Generic fetch wrapper ----------

async function request<T>(method: string, path: string, data?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (data !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });

  if (response.status === 204) return undefined as T;
  if (response.ok) return (await response.json()) as T;

  const text = await response.text();
  throw new Error(`API ${method} ${path} failed (${response.status}): ${text}`);
}

// ---------- Typed API functions ----------

export const edgeguardApi = {
  getConfig: () => request<SystemConfig>("GET", "/api/system/config"),
  getStatus: () => request<SystemStatus>("GET", "/api/system/status"),
  getSnapshot: () => request<PipelineSnapshot>("GET", "/api/system/snapshot"),
  initialize: () => request<{ ok: boolean }>("POST", "/api/system/initialize"),
  start: () => request<{ ok: boolean }>("POST", "/api/system/start"),
  stop: () => request<{ ok: boolean }>("POST", "/api/system/stop"),
  clearDatabase: () => request<ClearDatabaseResult>("POST", "/api/system/clear-database"),
  setConnection: (online: boolean) =>
    request<{ ok: boolean }>("POST", "/api/connection", { online }),
  setMeshGateway: (active: boolean) =>
    request<{ ok: boolean }>("POST", "/api/mesh-gateway", { active }),
  injectAnomaly: (turbineId: number) =>
    request<{ ok: boolean }>("POST", `/api/turbines/${turbineId}/anomaly`),
  clearAnomaly: (turbineId: number) =>
    request<{ ok: boolean }>("DELETE", `/api/turbines/${turbineId}/anomaly`),
  getEdgeStorage: () => request<EdgeGuardItem[]>("GET", "/api/storage/edge"),
  getCentralStorage: () => request<EdgeGuardItem[]>("GET", "/api/storage/central"),
  getMetrics: () => request<Metrics>("GET", "/api/metrics"),
  getTurbineHistory: (id: number) =>
    request<DataPoint[]>("GET", `/api/turbines/${id}/history`),
};
