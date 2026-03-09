import type { PipelineState } from "~/stores/pipelineStore";

export const selectIsRunning = (s: PipelineState) => s.status.isRunning;
export const selectIsOnline = (s: PipelineState) => s.status.isOnline;
export const selectIsRecoverySyncActive = (s: PipelineState) =>
  s.status.isRecoverySyncActive ?? false;
export const selectIsMeshGatewayActive = (s: PipelineState) =>
  s.meshGatewayOverride ?? s.status.isMeshGatewayActive ?? false;
export const selectCanStart = (s: PipelineState) =>
  s.isInitialized && !s.status.isRunning && s.systemState !== "clearing";
export const selectCanStop = (s: PipelineState) => s.status.isRunning;
export const selectCanClear = (s: PipelineState) => !s.isClearing;
export const selectCanToggleLink = (s: PipelineState) =>
  s.systemState === "running" || s.systemState === "idle";
export const selectCanToggleMeshGateway = (s: PipelineState) =>
  s.isInitialized && !s.isClearing;
