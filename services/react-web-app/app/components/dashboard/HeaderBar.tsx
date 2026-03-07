import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { usePipelineStore, EDGE_CAPACITY } from "~/stores/pipelineStore";
import { edgeguardApi } from "~/lib/api";
import { Play, Square } from "lucide-react";

export function HeaderBar() {
  const isOnline = usePipelineStore((s) => s.isOnline);
  const isRunning = usePipelineStore((s) => s.isRunning);
  const isInitialized = usePipelineStore((s) => s.isInitialized);
  const introComplete = usePipelineStore((s) => s.introComplete);
  const totalPackets = usePipelineStore((s) => s.totalPacketsEmitted);
  const totalAnomalies = usePipelineStore((s) => s.totalAnomalies);
  const edgeStorage = usePipelineStore((s) => s.edgeStorage);

  const startSimulation = () => { edgeguardApi.start().catch(() => {}); };
  const stopSimulation = () => { edgeguardApi.stop().catch(() => {}); };

  const [clock, setClock] = useState(formatClock());

  useEffect(() => {
    const id = setInterval(() => setClock(formatClock()), 1000);
    return () => clearInterval(id);
  }, []);

  const anomalyRate = totalPackets > 0
    ? ((totalAnomalies / totalPackets) * 100).toFixed(1)
    : "0.0";
  const utilization = ((edgeStorage.length / EDGE_CAPACITY) * 100).toFixed(0);

  const showStartStop = isInitialized && introComplete;

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="flex items-center justify-between px-6 py-4 border-b border-[var(--eg-border)] bg-white/88 backdrop-blur-sm"
      style={{ boxShadow: "0 10px 30px rgba(30, 50, 79, 0.05)" }}
    >
      {/* Left: title */}
      <div className="flex items-center gap-4">
        <div className="h-10 w-1.5 rounded-full bg-[var(--eg-alert)]" />
        <div className="flex items-center gap-6">
        <h1 className="font-display text-3xl font-bold tracking-[0.08em] text-[var(--eg-flow)]">
          EDGEGUARD AI
        </h1>
        <div className="flex items-center gap-1.5">
          <div className={`eg-led ${isRunning ? (isOnline ? "eg-led-online" : "eg-led-offline") : ""}`}
               style={!isRunning ? { backgroundColor: "var(--eg-muted)", boxShadow: "none" } : undefined} />
          <span className={`text-[11px] font-display tracking-[0.12em] font-semibold ${
            !isRunning ? "text-[var(--eg-muted)]" : isOnline ? "text-[var(--eg-ok)]" : "text-[var(--eg-anomaly)]"
          }`}>
            {!isRunning ? "STANDBY" : isOnline ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
        </div>
      </div>

      {/* Center: metrics + control */}
      <div className="hidden md:flex items-center gap-6">
        {isRunning && (
          <>
            <Metric label="PACKETS" value={totalPackets.toString()} />
            <Metric label="ANOMALY RATE" value={`${anomalyRate}%`} color={parseFloat(anomalyRate) > 10 ? "var(--eg-anomaly)" : undefined} />
            <Metric label="EDGE UTIL" value={`${utilization}%`} color={parseInt(utilization) > 80 ? "var(--eg-anomaly)" : parseInt(utilization) > 50 ? "var(--eg-alert)" : undefined} />
          </>
        )}

        {/* START / STOP toggle */}
        {showStartStop && (
          isRunning ? (
            <motion.button
              onClick={stopSimulation}
              className="flex items-center gap-2 px-5 py-3 rounded-full border border-[var(--eg-anomaly)]/30 bg-[var(--eg-anomaly)]/8 text-[var(--eg-anomaly)] font-display text-[11px] tracking-[0.08em] font-semibold hover:bg-[var(--eg-anomaly)]/14 transition-colors"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Square className="w-3 h-3" />
              STOP SYSTEM
            </motion.button>
          ) : (
            <motion.button
              onClick={startSimulation}
              className="flex items-center gap-2 px-7 py-3 rounded-full bg-[var(--eg-flow)] text-white font-display text-[11px] tracking-[0.08em] font-semibold hover:bg-[#1c65a3] transition-colors"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              animate={{ boxShadow: ["0 8px 20px rgba(32,113,181,0.10)", "0 12px 28px rgba(32,113,181,0.18)", "0 8px 20px rgba(32,113,181,0.10)"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Play className="w-3 h-3" />
              START SYSTEM
            </motion.button>
          )
        )}
      </div>

      {/* Right: clock */}
      <div className="rounded-full border border-[var(--eg-border)] bg-white px-4 py-2 font-mono text-[12px] text-[var(--eg-text-dim)] tracking-wide">
        {clock}
      </div>
    </motion.header>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className="text-[9px] font-display tracking-[0.08em] text-[var(--eg-text-dim)] mb-0.5">
        {label}
      </div>
      <div
        className="font-mono text-sm font-bold"
        style={{ color: color || "var(--eg-text-bright)" }}
      >
        {value}
      </div>
    </div>
  );
}

function formatClock(): string {
  const now = new Date();
  return now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
