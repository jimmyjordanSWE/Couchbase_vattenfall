import type { Route } from "./+types/demo";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plane, Play, RotateCcw, Square, Wifi, WifiOff } from "lucide-react";
import { PipelineView } from "~/components/pipeline/PipelineView";
import { TurbineCard } from "~/components/dashboard/TurbineCard";
import { CentralStorageCard, EdgeStorageCard } from "~/components/dashboard/StoragePanel";
import { CentralDataTable, EdgeDataTable } from "~/components/dashboard/DataTables";
import { IntroTour } from "~/components/dashboard/IntroTour";
import { useEventStream } from "~/hooks/useEventStream";
import { edgeguardApi } from "~/lib/api";
import {
  selectCanClear,
  selectCanToggleMeshGateway,
  selectCanStart,
  selectCanStop,
  selectCanToggleLink,
  selectIsMeshGatewayActive,
  selectIsOnline,
  selectIsRunning,
} from "~/stores/pipelineSelectors";
import {
  usePipelineStore,
} from "~/stores/pipelineStore";

function DroneBadgeIcon({
  active,
  className = "h-4 w-4",
}: {
  active: boolean;
  className?: string;
}) {
  return (
    <Plane
      className={className}
      aria-hidden="true"
      style={{ color: active ? "currentColor" : "var(--eg-flow)" }}
      strokeWidth={2}
    />
  );
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "EdgeGuard AI - Command Center" },
    { name: "description", content: "EdgeGuard AI: Edge-Cloud Pipeline Intelligence" },
  ];
}

function VattenfallMark() {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/vattenfall-logo-grey.svg"
        alt="VATTENFALL"
        className="block h-32 w-auto"
      />
      <div className="h-14 w-px bg-[var(--eg-border)]" />
      <div className="text-[32px] font-display font-bold tracking-[-0.04em] text-[var(--eg-flow)]">
        EdgeGuard
      </div>
    </div>
  );
}

function BootOverlay() {
  const localInitialize = usePipelineStore((s) => s.initialize);
  const clearPipelineData = usePipelineStore((s) => s.clearPipelineData);
  const [isBooting, setIsBooting] = useState(false);

  const handleInitialize = async () => {
    if (isBooting) return;
    setIsBooting(true);
    clearPipelineData();
    localInitialize();

    void (async () => {
      try {
        await edgeguardApi.initialize();
        const status = await edgeguardApi.getStatus();
        if (status.isRunning) {
          await edgeguardApi.stop();
        }
      } catch {
        // Leave the UI initialized even if the backend is momentarily unavailable.
      } finally {
        setIsBooting(false);
      }
    })();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ backgroundColor: "var(--eg-bg)" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
    >
      <div className="eg-atmosphere pointer-events-none absolute inset-0" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(var(--eg-flow) 1px, transparent 1px), linear-gradient(90deg, var(--eg-flow) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="pointer-events-auto relative z-10 flex flex-col items-center gap-1">
        <motion.div
          className="mt-[30px] flex flex-col items-center gap-0"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
        >
          <img
            src="/vattenfall-logo-grey.svg"
            alt="VATTENFALL"
            className="mb-[-46px] h-56 w-auto"
          />
          <div className="mt-[-4px] font-display text-[42px] font-bold tracking-[-0.04em] text-[var(--eg-flow)]">
            EdgeGuard
          </div>
        </motion.div>

        <motion.div
          className="mt-2 flex items-center gap-6 rounded-full border border-[var(--eg-border)] bg-white px-5 py-2 text-[9px] font-display tracking-[0.16em] shadow-[0_8px_24px_rgba(30,50,79,0.06)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.28, duration: 0.22 }}
        >
          {["TURBINES", "EDGE AI", "COUCHBASE", "SYNC LINK"].map((system, index) => (
            <motion.div
              key={system}
              className="flex items-center gap-1.5"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.28 + index * 0.05, duration: 0.18 }}
            >
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--eg-alert)]" />
              <span className="text-[var(--eg-text-dim)]">{system}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.button
          onClick={handleInitialize}
          disabled={isBooting}
          className="relative mt-2 overflow-hidden rounded-full bg-[var(--eg-flow)] px-10 py-4 font-display text-sm font-semibold tracking-[0.08em] text-white shadow-[0_16px_32px_rgba(32,113,181,0.18)] disabled:cursor-not-allowed disabled:opacity-70"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, type: "spring", stiffness: 220, damping: 20 }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
        >
          <motion.div
            className="absolute inset-0 bg-white/20"
            animate={{ opacity: [0, 0.18, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <span className="relative z-10">{isBooting ? "INITIALIZING..." : "INITIALIZE SYSTEM"}</span>
        </motion.button>
      </div>
    </motion.div>
  );
}

export default function Demo() {
  const isRunning = usePipelineStore(selectIsRunning);
  const isInitialized = usePipelineStore((s) => s.isInitialized);
  const isOnline = usePipelineStore(selectIsOnline);
  const metrics = usePipelineStore((s) => s.metrics);
  const edgeStorageLength = usePipelineStore((s) => s.edgeStorage.length);
  const edgeCapacity = usePipelineStore((s) => s.config.edgeCapacity);
  const isMeshGatewayActive = usePipelineStore(selectIsMeshGatewayActive);
  const canStart = usePipelineStore(selectCanStart);
  const canStop = usePipelineStore(selectCanStop);
  const canClear = usePipelineStore(selectCanClear);
  const canToggleLink = usePipelineStore(selectCanToggleLink);
  const canToggleMeshGateway = usePipelineStore(selectCanToggleMeshGateway);
  const clearPipelineData = usePipelineStore((s) => s.clearPipelineData);
  const beginClearing = usePipelineStore((s) => s.beginClearing);
  const finishClearing = usePipelineStore((s) => s.finishClearing);
  const setMeshGatewayOverride = usePipelineStore((s) => s.setMeshGatewayOverride);
  const drainMeshGatewayOne = usePipelineStore((s) => s.drainMeshGatewayOne);

  useEffect(() => {
    if (!isInitialized || !isRunning || isOnline || !isMeshGatewayActive) return;
    const timer = window.setInterval(() => {
      drainMeshGatewayOne();
    }, 225);
    return () => window.clearInterval(timer);
  }, [drainMeshGatewayOne, isInitialized, isMeshGatewayActive, isOnline, isRunning]);

  useEffect(() => {
    if (!isMeshGatewayActive || edgeStorageLength > 0) return;
    setMeshGatewayOverride(false);
  }, [edgeStorageLength, isMeshGatewayActive, setMeshGatewayOverride]);

  useEventStream(isInitialized);

  const showBoot = !isInitialized;
  const showTour = false;

  const startSystem = () => {
    const enabledTurbines = usePipelineStore.getState().enabledTurbines;
    const ensureEnabled = enabledTurbines.length > 0
      ? Promise.resolve()
      : Promise.all([1, 2, 3].map((turbineId) => edgeguardApi.setTurbineEnabled(turbineId, true))).then(() => undefined);

    ensureEnabled
      .then(() => edgeguardApi.start())
      .catch(() => {});
  };
  const stopSystem = () => {
    edgeguardApi.stop().catch(() => {});
  };
  const toggleConnection = () => {
    edgeguardApi.setConnection(!isOnline).catch(() => {});
  };
  const toggleMeshGateway = () => {
    setMeshGatewayOverride(!isMeshGatewayActive);
  };
  const clearDatabase = async () => {
    beginClearing();
    try {
      await edgeguardApi.clearDatabase();
      clearPipelineData();
    } catch {
      // no-op for now
    } finally {
      finishClearing();
    }
  };

  return (
    <div
      className="edgeguard-demo demo-bg eg-atmosphere min-h-screen text-[var(--eg-text)]"
      style={{ backgroundColor: "var(--eg-bg)" }}
    >
      <AnimatePresence>
        {showBoot && <BootOverlay />}
      </AnimatePresence>

      <AnimatePresence>{showTour && <IntroTour />}</AnimatePresence>

      <div className="relative z-10 flex min-h-screen flex-col">
        <main className="mx-auto flex w-full max-w-[1560px] flex-1 flex-col gap-6 px-6 py-8">
          <section className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-[720px]">
              <VattenfallMark />
            </div>

            <div className="grid min-w-[320px] grid-cols-3 gap-3">
              <div className="eg-panel px-5 py-4">
                <div className="text-[12px] font-display font-bold tracking-[0.04em] text-[var(--eg-text-dim)]">
                  System
                </div>
                <div className="mt-2 flex items-center gap-3 text-[22px] font-bold text-[var(--eg-text)]">
                  <span>{isRunning ? "Running" : "Standby"}</span>
                  {isRunning ? (
                    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--eg-flow)] border-t-transparent" />
                  ) : null}
                </div>
              </div>
              <div className="eg-panel px-5 py-4">
                <div className="text-[12px] font-display font-bold tracking-[0.04em] text-[var(--eg-text-dim)]">
                  Connection
                </div>
                <div className="mt-2 text-[22px] font-bold text-[var(--eg-text)]">
                  {isOnline ? "Online" : "Offline"}
                </div>
              </div>
              <div className="eg-panel px-5 py-4">
                <div className="text-[12px] font-display font-bold tracking-[0.04em] text-[var(--eg-text-dim)]">
                  Anomalies
                </div>
                <div className="mt-2 text-[22px] font-bold text-[var(--eg-text)]">
                  {metrics.totalAnomalies}/{metrics.totalPacketsEmitted || 0}
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-3 border-b border-[var(--eg-border)] pb-4">
            {isRunning ? (
              <button
                onClick={stopSystem}
                disabled={!canStop}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--eg-anomaly)] bg-[var(--eg-anomaly)] px-5 py-3 text-[14px] font-display font-bold tracking-[0.03em] text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Square className="h-4 w-4" />
                Stop System
              </button>
            ) : (
              <button
                onClick={startSystem}
                disabled={!canStart}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--eg-flow)] px-5 py-3 text-[14px] font-display font-bold tracking-[0.03em] text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Play className="h-4 w-4" />
                Start System
              </button>
            )}

            <button
              onClick={toggleConnection}
              disabled={!canToggleLink}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-display font-bold tracking-[0.03em] ${
                isOnline
                  ? "border border-[var(--eg-anomaly)] bg-[var(--eg-anomaly)] text-white"
                  : "border border-[var(--eg-flow)] bg-white text-[var(--eg-flow)]"
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              {isOnline ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
              {isOnline ? "Kill Connection" : "Restore Link"}
            </button>

            <button
              onClick={toggleMeshGateway}
              disabled={!canToggleMeshGateway}
              className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-display font-bold tracking-[0.03em] ${
                isMeshGatewayActive
                  ? "border border-[var(--eg-ok)] bg-[var(--eg-ok)] text-white"
                  : "border border-[var(--eg-border)] bg-white text-[var(--eg-flow)]"
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <DroneBadgeIcon active={isMeshGatewayActive} />
              {isMeshGatewayActive ? "Close Mesh Gateway" : "Open Mesh Gateway"}
            </button>

            <button
              onClick={clearDatabase}
              disabled={!canClear}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--eg-border)] bg-white px-5 py-3 text-[14px] font-display font-bold tracking-[0.03em] text-[var(--eg-flow)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RotateCcw className="h-4 w-4" />
              Clear Database
            </button>

            <div className="ml-auto flex flex-wrap gap-3">
              <div className="rounded-2xl border border-[var(--eg-border)] bg-white px-4 py-2 text-[13px] text-[var(--eg-text)]">
                {isRunning ? "Live simulation" : "System idle"}
              </div>
              <div className="rounded-2xl border border-[var(--eg-border)] bg-white px-4 py-2 text-[13px] text-[var(--eg-text)]">
                Edge capacity {edgeCapacity}
              </div>
              <div className="rounded-2xl border border-[var(--eg-border)] bg-white px-4 py-2 text-[13px] text-[var(--eg-text)]">
                Edge buffer {edgeStorageLength}
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <TurbineCard turbineId={1} delay={0.1} />
            <TurbineCard turbineId={2} delay={0.2} />
            <TurbineCard turbineId={3} delay={0.3} />
          </section>

          <section className="flex min-h-0 flex-col gap-5">
            <div className="eg-panel p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] font-display font-semibold tracking-[0.08em] text-[var(--eg-text-dim)]">
                    DATA PIPELINE
                  </div>
                </div>
                <div className="rounded-full bg-[var(--eg-alert)]/18 px-4 py-2 text-[12px] font-display font-semibold tracking-[0.06em] text-[var(--eg-text)]">
                  {isOnline ? "SYNC ACTIVE" : isMeshGatewayActive ? "MESH DRAIN ACTIVE" : "EDGE BUFFERING"}
                </div>
              </div>
              <PipelineView />
            </div>

            <div className="grid min-h-[520px] gap-5 xl:grid-cols-2">
              <div className="flex min-h-0 flex-col gap-4">
                <EdgeStorageCard delay={0.2} />
                <EdgeDataTable />
              </div>
              <div className="flex min-h-0 flex-col gap-4">
                <CentralStorageCard delay={0.25} />
                <CentralDataTable />
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
