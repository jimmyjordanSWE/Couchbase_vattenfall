import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePipelineStore } from "~/stores/pipelineStore";
import { COMPACTION_THRESHOLD, EDGE_CAPACITY } from "~/stores/pipelineStore";
import { edgeguardApi } from "~/lib/api";
import {
  BRAIN_X,
  BUFFER_X,
  CENTRAL_X,
  PIPE_END_X,
  PIPE_PATH_LEFT,
  PIPE_PATH_RIGHT,
  PIPE_START_X,
  PIPE_Y,
  TURBINE_POSITIONS,
  VALVE_X,
} from "~/components/pipeline/pipelineGeometry";

const VIEW = { width: 1100, height: 350 };

function TurbineGlyph({
  x,
  y,
  hubY,
  active,
  label,
  isRunning,
  onActivate,
}: {
  x: number;
  y: number;
  hubY: number;
  active: boolean;
  label: string;
  isRunning: boolean;
  onActivate: () => void;
}) {
  const dormant = !isRunning;
  const bladeColor = dormant
    ? "var(--eg-muted)"
    : active
      ? "var(--eg-anomaly)"
      : "var(--eg-flow)";
  const hubColor = dormant ? "var(--eg-muted)" : active ? "var(--eg-anomaly)" : "var(--eg-flow)";

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={active ? `${label} anomaly burst active` : `${label} send anomaly burst`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isRunning) onActivate();
        }
      }}
      style={{ cursor: isRunning ? "pointer" : "default" }}
      onClick={() => isRunning && onActivate()}
    >
      {/* Tower */}
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={hubY + 10}
        stroke={dormant ? "var(--eg-muted)" : active ? "var(--eg-anomaly)" : "var(--eg-border-bright)"}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={dormant ? 0.4 : 1}
      />

      {/* Base */}
      <rect
        x={x - 14}
        y={y - 4}
        width={28}
        height={8}
        rx={2}
        fill="var(--eg-surface)"
        stroke={dormant ? "var(--eg-muted)" : active ? "var(--eg-anomaly)" : "var(--eg-border-bright)"}
        strokeWidth={1.2}
        opacity={dormant ? 0.4 : 1}
      />

      {/* Hub */}
      <circle
        cx={x}
        cy={hubY}
        r={6}
        fill={hubColor}
        opacity={dormant ? 0.3 : 0.9}
      />
      {active && isRunning && (
        <circle cx={x} cy={hubY} r={12} fill="none" stroke="var(--eg-anomaly)" strokeWidth={1} opacity={0.4}>
          <animate attributeName="r" values="8;18;8" dur="1s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="1s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Blades */}
      <g>
        {isRunning ? (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${x} ${hubY}`}
            to={`360 ${x} ${hubY}`}
            dur={active ? "0.8s" : "2.5s"}
            repeatCount="indefinite"
          />
        ) : null}
        <line x1={x} y1={hubY} x2={x} y2={hubY - 26} stroke={bladeColor} strokeWidth={2.5} strokeLinecap="round" opacity={dormant ? 0.3 : 1} />
        <line x1={x} y1={hubY} x2={x - 22} y2={hubY + 14} stroke={bladeColor} strokeWidth={2.5} strokeLinecap="round" opacity={dormant ? 0.3 : 1} />
        <line x1={x} y1={hubY} x2={x + 22} y2={hubY + 14} stroke={bladeColor} strokeWidth={2.5} strokeLinecap="round" opacity={dormant ? 0.3 : 1} />
      </g>

      {/* Label */}
      <text
        x={x}
        y={y + 22}
        textAnchor="middle"
        fill={dormant ? "var(--eg-muted)" : active ? "var(--eg-anomaly)" : "var(--eg-text-dim)"}
        fontSize="13"
        fontWeight="600"
        fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
        opacity={dormant ? 0.4 : 1}
      >
        {label}
      </text>
    </g>
  );
}

function AIChipNode({ x, y, isRunning }: { x: number; y: number; isRunning: boolean }) {
  const dormant = !isRunning;
  const color = dormant ? "var(--eg-muted)" : "var(--eg-flow)";
  const activeOpacity = dormant ? 0.3 : 1;
  const s = 18;

  return (
    <g transform={`translate(${x}, ${y})`} opacity={activeOpacity}>
      {/* Smooth scale pulse when working (no red flash) */}
      {isRunning && (
        <circle cx={0} cy={0} r={28} fill="none" stroke={color} strokeWidth={0.6} opacity={0.1} className="ai-pulse" />
      )}

      <g>
        {isRunning && (
          <animateTransform
            attributeName="transform"
            type="scale"
            values="1;1.08;1"
            dur="2.4s"
            repeatCount="indefinite"
          />
        )}
        {/* Hexagonal chip shape — always flow color, no red */}
        <polygon
          points={`0,${-s} ${s * 0.87},${-s * 0.5} ${s * 0.87},${s * 0.5} 0,${s} ${-s * 0.87},${s * 0.5} ${-s * 0.87},${-s * 0.5}`}
          fill="var(--eg-surface)"
          stroke={color}
          strokeWidth={1.6}
        />

        {/* Inner circuit lines */}
        <line x1={-6} y1={-6} x2={6} y2={-6} stroke={color} strokeWidth={0.6} opacity={0.4} />
        <line x1={-6} y1={0} x2={6} y2={0} stroke={color} strokeWidth={0.6} opacity={0.4} />
        <line x1={-6} y1={6} x2={6} y2={6} stroke={color} strokeWidth={0.6} opacity={0.4} />
        <line x1={0} y1={-8} x2={0} y2={8} stroke={color} strokeWidth={0.6} opacity={0.3} />

        {/* Pin stubs (left/right) */}
        {[-8, -3, 3, 8].map((dy) => (
          <g key={`pins-${dy}`}>
            <line x1={-s * 0.87} y1={dy} x2={-s * 0.87 - 5} y2={dy} stroke={color} strokeWidth={0.8} opacity={0.3} />
            <line x1={s * 0.87} y1={dy} x2={s * 0.87 + 5} y2={dy} stroke={color} strokeWidth={0.8} opacity={0.3} />
          </g>
        ))}

        {/* Core glow dot */}
        <circle cx={0} cy={0} r={4} fill={color} opacity={dormant ? 0.15 : 0.2}>
          {isRunning && (
            <animate attributeName="opacity" values="0.1;0.25;0.1" dur="3.5s" repeatCount="indefinite" />
          )}
        </circle>
      </g>

      {/* Labels */}
      <text x={0} y={s + 16} textAnchor="middle" fill={dormant ? "var(--eg-muted)" : "var(--eg-text-dim)"} fontSize="10" fontWeight="600" fontFamily="IBM Plex Sans, Segoe UI, sans-serif">
        EDGE AI
      </text>
      <text x={0} y={s + 29} textAnchor="middle" fill={color} fontSize="8" fontWeight="500" fontFamily="IBM Plex Sans, Segoe UI, sans-serif" opacity={0.6}>
        ISOLATION FOREST
      </text>
    </g>
  );
}

function BufferTank({ x, y, ratio, inCompactionZone, compactionFlash, isRunning }: {
  x: number;
  y: number;
  ratio: number;
  inCompactionZone: boolean;
  compactionFlash: boolean;
  isRunning: boolean;
}) {
  const tankH = 120;
  const tankW = 70;
  const fluidH = ratio * (tankH - 8);
  const dormant = !isRunning;
  const fluidColor = dormant
    ? "var(--eg-muted)"
    : inCompactionZone
      ? "var(--eg-anomaly)"
      : ratio > 0.6
        ? "var(--eg-alert)"
        : "var(--eg-flow)";

  return (
    <g transform={`translate(${x}, ${y})`} opacity={dormant ? 0.4 : 1}>
      {/* Tank outline */}
      <rect
        x={-tankW / 2}
        y={-tankH / 2}
        width={tankW}
        height={tankH}
        rx={6}
        fill="var(--eg-bg)"
        stroke={dormant ? "var(--eg-muted)" : inCompactionZone ? "var(--eg-anomaly)" : "var(--eg-border-bright)"}
        strokeWidth={1.5}
      />

      {/* Capacity markings */}
      {[0.25, 0.5, 0.75].map((mark) => (
        <g key={mark}>
          <line
            x1={-tankW / 2 + 2}
            y1={tankH / 2 - 4 - mark * (tankH - 8)}
            x2={-tankW / 2 + 8}
            y2={tankH / 2 - 4 - mark * (tankH - 8)}
            stroke="var(--eg-muted)"
            strokeWidth={0.5}
          />
          <text
            x={-tankW / 2 + 10}
            y={tankH / 2 - 4 - mark * (tankH - 8) + 3}
            fill="var(--eg-muted)"
            fontSize="6"
            fontFamily="JetBrains Mono, monospace"
          >
            {Math.round(mark * 100)}%
          </text>
        </g>
      ))}

      {/* Fluid fill */}
      <defs>
        <linearGradient id="buffer-fluid" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={fluidColor} stopOpacity="0.85" />
          <stop offset="100%" stopColor={fluidColor} stopOpacity="0.3" />
        </linearGradient>
        <clipPath id="tank-clip">
          <rect x={-tankW / 2 + 2} y={-tankH / 2 + 2} width={tankW - 4} height={tankH - 4} rx={5} />
        </clipPath>
      </defs>

      <g clipPath="url(#tank-clip)">
        <rect
          x={-tankW / 2 + 2}
          y={tankH / 2 - 2 - fluidH}
          width={tankW - 4}
          height={fluidH}
          fill="url(#buffer-fluid)"
        />
        {fluidH > 2 && isRunning && (
          <path
            d={`M ${-tankW / 2 + 2} ${tankH / 2 - 2 - fluidH} Q ${-tankW / 4} ${tankH / 2 - 2 - fluidH - 3} 0 ${tankH / 2 - 2 - fluidH} Q ${tankW / 4} ${tankH / 2 - 2 - fluidH + 3} ${tankW / 2 - 2} ${tankH / 2 - 2 - fluidH}`}
            fill={fluidColor}
            opacity={0.4}
          >
            <animate
              attributeName="d"
              values={`M ${-tankW / 2 + 2} ${tankH / 2 - 2 - fluidH} Q ${-tankW / 4} ${tankH / 2 - 2 - fluidH - 3} 0 ${tankH / 2 - 2 - fluidH} Q ${tankW / 4} ${tankH / 2 - 2 - fluidH + 3} ${tankW / 2 - 2} ${tankH / 2 - 2 - fluidH};M ${-tankW / 2 + 2} ${tankH / 2 - 2 - fluidH} Q ${-tankW / 4} ${tankH / 2 - 2 - fluidH + 3} 0 ${tankH / 2 - 2 - fluidH} Q ${tankW / 4} ${tankH / 2 - 2 - fluidH - 3} ${tankW / 2 - 2} ${tankH / 2 - 2 - fluidH};M ${-tankW / 2 + 2} ${tankH / 2 - 2 - fluidH} Q ${-tankW / 4} ${tankH / 2 - 2 - fluidH - 3} 0 ${tankH / 2 - 2 - fluidH} Q ${tankW / 4} ${tankH / 2 - 2 - fluidH + 3} ${tankW / 2 - 2} ${tankH / 2 - 2 - fluidH}`}
              dur="2s"
              repeatCount="indefinite"
            />
          </path>
        )}
      </g>

      {/* Compaction flash overlay */}
      {compactionFlash && (
        <rect
          x={-tankW / 2}
          y={-tankH / 2}
          width={tankW}
          height={tankH}
          rx={6}
          fill="var(--eg-flow)"
          opacity={0.25}
        >
          <animate attributeName="opacity" values="0.3;0" dur="0.5s" fill="freeze" />
        </rect>
      )}

      {/* DB icon inside tank */}
      <g transform="translate(0, -48)">
        <ellipse cx={0} cy={0} rx={10} ry={3} fill="none" stroke={dormant ? "var(--eg-muted)" : "var(--eg-flow)"} strokeWidth={0.6} opacity={0.4} />
        <rect x={-10} y={0} width={20} height={10} fill="none" stroke={dormant ? "var(--eg-muted)" : "var(--eg-flow)"} strokeWidth={0.6} opacity={0.3} />
        <ellipse cx={0} cy={10} rx={10} ry={3} fill="none" stroke={dormant ? "var(--eg-muted)" : "var(--eg-flow)"} strokeWidth={0.6} opacity={0.4} />
      </g>

      {/* Labels */}
      <text x={0} y={tankH / 2 + 16} textAnchor="middle" fill={dormant ? "var(--eg-muted)" : inCompactionZone ? "var(--eg-anomaly)" : "var(--eg-text-dim)"} fontSize="10" fontWeight="600" fontFamily="IBM Plex Sans, Segoe UI, sans-serif">
        EDGE COUCHBASE
      </text>
      <text x={0} y={tankH / 2 + 28} textAnchor="middle" fill={dormant ? "var(--eg-muted)" : inCompactionZone ? "var(--eg-anomaly)" : "var(--eg-flow)"} fontSize="9" fontWeight="700" fontFamily="JetBrains Mono, monospace">
        {Math.round(ratio * 100)}%
      </text>
    </g>
  );
}

function ValveNode({ x, y, isOnline, isRunning, onToggle }: {
  x: number;
  y: number;
  isOnline: boolean;
  isRunning: boolean;
  onToggle: () => void;
}) {
  const dormant = !isRunning;
  const color = dormant ? "var(--eg-muted)" : isOnline ? "var(--eg-flow)" : "var(--eg-anomaly)";

  return (
    <g
      transform={`translate(${x}, ${y})`}
      role="button"
      tabIndex={0}
      aria-label={isOnline ? "Close valve to simulate outage" : "Open valve to restore connection"}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isRunning) onToggle();
        }
      }}
      onClick={() => isRunning && onToggle()}
      style={{ cursor: isRunning ? "pointer" : "default" }}
      opacity={dormant ? 0.4 : 1}
    >
      <rect x={-42} y={-5} width={20} height={10} rx={3} fill="var(--eg-surface)" stroke={color} strokeWidth={1.2} />
      <rect x={22} y={-5} width={20} height={10} rx={3} fill="var(--eg-surface)" stroke={color} strokeWidth={1.2} />

      <path
        d="M -22 0 C -13 -18, -5 -18, 5 0"
        fill="none"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
        opacity={isOnline ? 0.95 : 0.28}
      />
      <path
        d="M -5 0 C 5 18, 13 18, 22 0"
        fill="none"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
        opacity={isOnline ? 0.95 : 0.28}
      />

      {!isOnline && (
        <>
          <path d="M -4 -18 L 4 -8" stroke="var(--eg-anomaly)" strokeWidth={2.6} strokeLinecap="round" />
          <path d="M -4 -8 L 4 -18" stroke="var(--eg-anomaly)" strokeWidth={2.6} strokeLinecap="round" />
        </>
      )}

      {isOnline && isRunning && (
        <ellipse cx={0} cy={0} rx={24} ry={20} fill="none" stroke="var(--eg-flow)" strokeWidth={0.7} opacity={0.18}>
          <animate attributeName="opacity" values="0.08;0.24;0.08" dur="2.4s" repeatCount="indefinite" />
        </ellipse>
      )}

      {!isOnline && isRunning && (
        <ellipse cx={0} cy={0} rx={30} ry={24} fill="none" stroke="var(--eg-anomaly)" strokeWidth={1} opacity={0.28}>
          <animate attributeName="opacity" values="0.12;0.35;0.12" dur="1.5s" repeatCount="indefinite" />
        </ellipse>
      )}

      <text x={0} y={40} textAnchor="middle" fill={color} fontSize="10" fontWeight="600" fontFamily="IBM Plex Sans, Segoe UI, sans-serif">
        {dormant ? "LINK IDLE" : isOnline ? "LINK LIVE" : "LINK LOST"}
      </text>
    </g>
  );
}

function CentralDBNode({ x, y, count, isOnline, isRunning }: {
  x: number;
  y: number;
  count: number;
  isOnline: boolean;
  isRunning: boolean;
}) {
  const dormant = !isRunning;
  const color = dormant ? "var(--eg-muted)" : isOnline ? "var(--eg-flow)" : "var(--eg-muted)";
  const opacity = dormant ? 0.35 : isOnline ? 1 : 0.4;

  return (
    <g transform={`translate(${x}, ${y})`} opacity={opacity}>
      {/* Cloud shape */}
      <ellipse cx={0} cy={-24} rx={32} ry={10} fill="var(--eg-surface)" stroke={color} strokeWidth={1.2} />
      <rect x={-32} y={-24} width={64} height={48} fill="var(--eg-surface)" stroke={color} strokeWidth={1.2} />
      <ellipse cx={0} cy={24} rx={32} ry={10} fill="var(--eg-surface)" stroke={color} strokeWidth={1.2} />

      {/* DB lines */}
      <line x1={-20} y1={-8} x2={20} y2={-8} stroke={color} opacity={0.4} strokeWidth={0.6} />
      <line x1={-20} y1={4} x2={20} y2={4} stroke={color} opacity={0.4} strokeWidth={0.6} />
      <line x1={-20} y1={16} x2={20} y2={16} stroke={color} opacity={0.4} strokeWidth={0.6} />

      {/* Count */}
      <text x={0} y={2} textAnchor="middle" fill={color} fontSize="14" fontWeight="700" fontFamily="JetBrains Mono, monospace">
        {count}
      </text>

      {/* Active glow */}
      {isOnline && isRunning && (
        <ellipse cx={0} cy={0} rx={36} ry={28} fill="none" stroke="var(--eg-flow)" strokeWidth={0.5} opacity={0.15}>
          <animate attributeName="opacity" values="0.08;0.2;0.08" dur="3s" repeatCount="indefinite" />
        </ellipse>
      )}

      {/* Labels */}
      <text x={0} y={48} textAnchor="middle" fill={dormant ? "var(--eg-muted)" : isOnline ? "var(--eg-text-dim)" : "var(--eg-muted)"} fontSize="10" fontWeight="600" fontFamily="IBM Plex Sans, Segoe UI, sans-serif">
        CENTRAL DB
      </text>
      {!isOnline && isRunning && (
        <text x={0} y={60} textAnchor="middle" fill="var(--eg-anomaly)" fontSize="8" fontWeight="600" fontFamily="IBM Plex Sans, Segoe UI, sans-serif" opacity={0.8}>
          UNREACHABLE
        </text>
      )}
    </g>
  );
}

function ConveyorLane({
  path,
  color,
  count,
  duration,
  size,
  opacity = 0.9,
  anomalyActive = false,
}: {
  path: string;
  color: string;
  count: number;
  duration: number;
  size: number;
  opacity?: number;
  anomalyActive?: boolean;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => {
        const begin = `-${(duration / count) * index}s`;

        return (
          <g key={`${path}-${index}`} filter="url(#glow-cyan)">
            <circle r={size * 1.8} fill={color} opacity={0.08} />
            <circle r={size} fill={color} opacity={opacity} />
            <circle r={Math.max(1.5, size * 0.45)} fill="white" opacity={0.65} />
            <animateMotion
              dur={`${duration}s`}
              begin={begin}
              repeatCount="indefinite"
              path={path}
              rotate="auto"
            />
          </g>
        );
      })}
      {anomalyActive && (
        <g filter="url(#glow-red)">
          <circle r={(size + 1) * 1.8} fill="var(--eg-anomaly)" opacity={0.12} />
          <circle r={size + 1} fill="var(--eg-anomaly)" opacity={0.95} />
          <circle r={Math.max(1.5, (size + 1) * 0.45)} fill="white" opacity={0.7} />
          <animateMotion
            dur={`${duration}s`}
            begin="0s"
            repeatCount="indefinite"
            path={path}
            rotate="auto"
          />
        </g>
      )}
    </>
  );
}

export function PipelineView() {
  const edgeStorage = usePipelineStore((s) => s.edgeStorage);
  const centralStorage = usePipelineStore((s) => s.centralStorage);
  const isOnline = usePipelineStore((s) => s.isOnline);
  const isRunning = usePipelineStore((s) => s.isRunning);
  const forcedAnomalyTurbine = usePipelineStore((s) => s.forcedAnomalyTurbine);
  const compactionCount = usePipelineStore((s) => s.compactionCount);
  const edgePressure = usePipelineStore((s) => s.edgePressure);
  const setOnline = (online: boolean) => {
    edgeguardApi.setConnection(online).catch(() => {});
  };
  const setForcedAnomalyTurbine = (id: number | null) => {
    if (id != null) {
      edgeguardApi.injectAnomaly(id).catch(() => {});
    } else if (forcedAnomalyTurbine != null) {
      edgeguardApi.clearAnomaly(forcedAnomalyTurbine).catch(() => {});
    }
    usePipelineStore.setState({ forcedAnomalyTurbine: id });
  };

  const [compactionFlash, setCompactionFlash] = useState(false);
  useEffect(() => {
    if (compactionCount === 0) return;
    setCompactionFlash(true);
    const timer = setTimeout(() => setCompactionFlash(false), 500);
    return () => clearTimeout(timer);
  }, [compactionCount]);

  const bufferRatio = Math.min(1, edgeStorage.length / EDGE_CAPACITY);
  const inCompactionZone = bufferRatio >= COMPACTION_THRESHOLD / EDGE_CAPACITY;
  const conveyorColor = edgePressure > 0.5 ? "var(--eg-alert)" : "var(--eg-flow)";
  const showAnomalyDot = isRunning && forcedAnomalyTurbine != null;
  const conveyorCount = 7;
  const conveyorDuration = 4.8;
  const conveyorSize = 4;

  return (
    <div className="w-full">
      <div className="relative rounded-xl border border-[var(--eg-border)] bg-[var(--eg-panel)] overflow-hidden shadow-[0_8px_60px_rgba(0,0,0,0.6)]">
        {/* Status banner overlay */}
        <AnimatePresence>
          {!isOnline && isRunning && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="pointer-events-none absolute left-4 right-4 top-3 z-20 rounded-md border border-[var(--eg-anomaly)] bg-[var(--eg-anomaly)] px-4 py-2 text-center shadow-[0_10px_24px_rgba(249,59,24,0.22)]"
            >
              <span className="font-display text-[11px] tracking-[0.08em] text-white font-bold">
                NETWORK DISCONNECTED — EDGE ISOLATION MODE
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <svg
          viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
          className="w-full h-auto block"
          style={{ minHeight: "240px" }}
          aria-hidden
        >
          <defs>
            <linearGradient id="pipe-glow-left" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--eg-flow)" stopOpacity="0.2" />
              <stop offset="50%" stopColor="var(--eg-flow)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="var(--eg-flow)" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="pipe-glow-right-on" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--eg-flow)" stopOpacity="0.5" />
              <stop offset="50%" stopColor="var(--eg-flow)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="var(--eg-flow)" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="pipe-glow-right-off" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--eg-muted)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--eg-muted)" stopOpacity="0.05" />
            </linearGradient>

            <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* === PIPES === */}
          <path d={PIPE_PATH_LEFT} fill="none" stroke={isRunning ? "var(--eg-border)" : "var(--eg-muted)"} strokeWidth={20} strokeLinecap="round" opacity={isRunning ? 1 : 0.3} />
          {isRunning && <path d={PIPE_PATH_LEFT} fill="none" stroke="url(#pipe-glow-left)" strokeWidth={10} strokeLinecap="round" />}
          {isRunning && (
            <ConveyorLane
              path={PIPE_PATH_LEFT}
              color={conveyorColor}
              count={conveyorCount}
              duration={conveyorDuration}
              size={conveyorSize}
              anomalyActive={showAnomalyDot}
            />
          )}

          <path d={PIPE_PATH_RIGHT} fill="none" stroke={isRunning ? "var(--eg-border)" : "var(--eg-muted)"} strokeWidth={20} strokeLinecap="round" opacity={isRunning ? 1 : 0.3} />
          {isRunning && (
            <path
              d={PIPE_PATH_RIGHT}
              fill="none"
              stroke={isOnline ? "url(#pipe-glow-right-on)" : "url(#pipe-glow-right-off)"}
              strokeWidth={10}
              strokeLinecap="round"
            />
          )}
          {isOnline && isRunning && (
            <ConveyorLane
              path={PIPE_PATH_RIGHT}
              color="var(--eg-flow)"
              count={conveyorCount}
              duration={conveyorDuration}
              size={conveyorSize}
              opacity={0.75}
            />
          )}

          {/* Section labels */}
          {isRunning && (
            <>
              <text x={PIPE_START_X + 15} y={PIPE_Y - 18} fill="var(--eg-text-dim)" fontSize="10" fontFamily="IBM Plex Sans, Segoe UI, sans-serif" opacity={0.6}>
                INGEST
              </text>
              <text x={VALVE_X + 40} y={PIPE_Y - 18} fill="var(--eg-text-dim)" fontSize="10" fontFamily="IBM Plex Sans, Segoe UI, sans-serif" opacity={isOnline ? 0.6 : 0.25}>
                CLOUD SYNC
              </text>
            </>
          )}

          {/* === TURBINES (triangular formation) === */}
          {TURBINE_POSITIONS.map((pos, index) => {
            const turbineId = index + 1;
            const active = forcedAnomalyTurbine === turbineId;
            const hubY = pos.y - 34;
            return (
              <TurbineGlyph
                key={turbineId}
                x={pos.x}
                y={pos.y}
                hubY={hubY}
                active={active}
                label={`T${turbineId}`}
                isRunning={isRunning}
                onActivate={() => setForcedAnomalyTurbine(active ? null : turbineId)}
              />
            );
          })}

          {/* === EDGE AI CHIP === */}
          <AIChipNode x={BRAIN_X} y={PIPE_Y} isRunning={isRunning} />

          {/* === BUFFER TANK === */}
          <BufferTank
            x={BUFFER_X}
            y={PIPE_Y}
            ratio={bufferRatio}
            inCompactionZone={inCompactionZone}
            compactionFlash={compactionFlash}
            isRunning={isRunning}
          />

          {/* === VALVE === */}
          <ValveNode
            x={VALVE_X}
            y={PIPE_Y}
            isOnline={isOnline}
            isRunning={isRunning}
            onToggle={() => setOnline(!isOnline)}
          />

          {/* === CENTRAL DB === */}
          <CentralDBNode
            x={CENTRAL_X}
            y={PIPE_Y}
            count={centralStorage.length}
            isOnline={isOnline}
            isRunning={isRunning}
          />
        </svg>

      </div>
    </div>
  );
}
