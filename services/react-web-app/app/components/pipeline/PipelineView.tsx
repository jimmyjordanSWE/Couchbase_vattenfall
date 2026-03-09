import { memo, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plane } from "lucide-react";
import { usePipelineStore } from "~/stores/pipelineStore";
import { COMPACTION_THRESHOLD, EDGE_CAPACITY } from "~/stores/pipelineStore";
import { edgeguardApi } from "~/lib/api";
import { BufferTank } from "~/components/pipeline/BufferTank";
import { PacketLayer } from "~/components/pipeline/PacketLayer";
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
import { isDataPoint } from "~/types/edgeguard";

const VIEW = { width: 1100, height: 350 };

/** Degrees per second when spinning (normal). ~2.5s per full revolution. */
const BLADE_SPIN_SPEED = 360 / 2.5;

function TurbineGlyph({
  x,
  y,
  hubY,
  active,
  label,
  isRunning,
  enabled,
  onActivate,
}: {
  x: number;
  y: number;
  hubY: number;
  active: boolean;
  label: string;
  isRunning: boolean;
  enabled: boolean;
  onActivate: () => void;
}) {
  const dormant = !isRunning || !enabled;
  const bladeColor = dormant
    ? "var(--eg-muted)"
    : active
      ? "var(--eg-anomaly)"
      : "var(--eg-flow)";
  const hubColor = dormant ? "var(--eg-muted)" : active ? "var(--eg-anomaly)" : "var(--eg-flow)";

  const spinning = isRunning && enabled;

  const showBeam = isRunning && enabled;

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={active ? `${label} anomaly burst active` : `${label} send anomaly burst`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isRunning && enabled) onActivate();
        }
      }}
      style={{ cursor: isRunning && enabled ? "pointer" : "default" }}
      onClick={() => isRunning && enabled && onActivate()}
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
      {active && isRunning && enabled && (
        <circle cx={x} cy={hubY} r={12} fill="none" stroke="var(--eg-anomaly)" strokeWidth={1} opacity={0.4}>
          <animate attributeName="r" values="8;18;8" dur="1s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="1s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Blades use SVG-native rotation to avoid per-frame React state updates. */}
      <g transform={`rotate(0 ${x} ${hubY})`}>
        {spinning && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${x} ${hubY}`}
            to={`360 ${x} ${hubY}`}
            dur={`${360 / BLADE_SPIN_SPEED}s`}
            repeatCount="indefinite"
          />
        )}
        <line x1={x} y1={hubY} x2={x} y2={hubY - 26} stroke={bladeColor} strokeWidth={2.5} strokeLinecap="round" opacity={dormant ? 0.3 : 1} />
        <line x1={x} y1={hubY} x2={x - 22} y2={hubY + 14} stroke={bladeColor} strokeWidth={2.5} strokeLinecap="round" opacity={dormant ? 0.3 : 1} />
        <line x1={x} y1={hubY} x2={x + 22} y2={hubY + 14} stroke={bladeColor} strokeWidth={2.5} strokeLinecap="round" opacity={dormant ? 0.3 : 1} />
      </g>

      {/* Data beam from turbine to pipe — only when turbine is on */}
      {showBeam && (
        <line
          x1={x}
          y1={y + 4}
          x2={PIPE_START_X}
          y2={PIPE_Y}
          stroke={active ? "var(--eg-anomaly)" : "var(--eg-flow)"}
          strokeWidth={0.8}
          strokeDasharray="3 6"
          opacity={0.3}
        />
      )}

      {/* Label */}
      <text
        x={x}
        y={y + 22}
        textAnchor="middle"
        fill={dormant ? "var(--eg-muted)" : active ? "var(--eg-anomaly)" : "var(--eg-text-dim)"}
        fontSize="10"
        fontWeight="700"
        fontFamily="Orbitron, sans-serif"
        opacity={dormant ? 0.4 : 1}
      >
        {label}
      </text>
    </g>
  );
}

function AIChipNode({ x, y, isActive, isRunning }: { x: number; y: number; isActive: boolean; isRunning: boolean }) {
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
      <text x={0} y={s + 16} textAnchor="middle" fill={dormant ? "var(--eg-muted)" : "var(--eg-text-dim)"} fontSize="8" fontWeight="600" fontFamily="Orbitron, sans-serif" letterSpacing="0.1em">
        EDGE AI
      </text>
      <text x={0} y={s + 26} textAnchor="middle" fill={color} fontSize="7" fontWeight="500" fontFamily="Orbitron, sans-serif" opacity={0.6} letterSpacing="0.05em">
        ISOLATION FOREST
      </text>
    </g>
  );
}

const EdgeAIChip = memo(function EdgeAIChip({ isRunning }: { isRunning: boolean }) {
  const packetsInTransit = usePipelineStore((s) => s.packetsInTransit);
  const brainActive = useMemo(() => {
    return packetsInTransit.some((p) => p.segment === "to-buffer");
  }, [packetsInTransit]);

  return <AIChipNode x={BRAIN_X} y={PIPE_Y} isActive={brainActive} isRunning={isRunning} />;
});

function ValveNode({ x, y, isOnline, isRunning, onToggle }: {
  x: number;
  y: number;
  isOnline: boolean;
  isRunning: boolean;
  onToggle: () => void;
}) {
  const dormant = !isRunning;
  const color = dormant ? "var(--eg-muted)" : isOnline ? "var(--eg-flow)" : "var(--eg-anomaly)";
  const gateRotation = isOnline ? 0 : 90;

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
      {/* Pipe stubs left/right */}
      <rect x={-38} y={-8} width={16} height={16} rx={2} fill="var(--eg-surface)" stroke={color} strokeWidth={1.2} />
      <rect x={22} y={-8} width={16} height={16} rx={2} fill="var(--eg-surface)" stroke={color} strokeWidth={1.2} />

      {/* Valve body - rounded housing */}
      <ellipse cx={0} cy={0} rx={22} ry={24} fill="var(--eg-surface)" stroke={color} strokeWidth={1.6} />

      {/* Gate disc - rotates between open (0°) and closed (90°) */}
      <g>
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={isOnline ? "90 0 0" : "0 0 0"}
          to={`${gateRotation} 0 0`}
          dur="0.4s"
          fill="freeze"
        />
        <rect x={-2} y={-20} width={4} height={40} rx={2} fill={color} opacity={0.7} />
        {/* Gate handle knob */}
        <circle cx={0} cy={-20} r={4} fill={color} opacity={0.5} />
        <circle cx={0} cy={20} r={4} fill={color} opacity={0.5} />
      </g>

      {/* Flow arrows when open */}
      {isOnline && isRunning && (
        <g opacity={0.4}>
          <path d="M -14 0 L -8 -3 L -8 3 Z" fill={color}>
            <animate attributeName="opacity" values="0.2;0.5;0.2" dur="1.2s" repeatCount="indefinite" />
          </path>
          <path d="M 8 0 L 14 -3 L 14 3 Z" fill={color}>
            <animate attributeName="opacity" values="0.2;0.5;0.2" dur="1.2s" begin="0.4s" repeatCount="indefinite" />
          </path>
        </g>
      )}

      {/* Blocked warning ring when closed */}
      {!isOnline && isRunning && (
        <ellipse cx={0} cy={0} rx={28} ry={30} fill="none" stroke="var(--eg-anomaly)" strokeWidth={1} opacity={0.3}>
          <animate attributeName="opacity" values="0.15;0.4;0.15" dur="1.5s" repeatCount="indefinite" />
        </ellipse>
      )}

      {/* Subtle glow when open */}
      {isOnline && isRunning && (
        <ellipse cx={0} cy={0} rx={26} ry={28} fill="none" stroke="var(--eg-flow)" strokeWidth={0.5} opacity={0.15}>
          <animate attributeName="opacity" values="0.08;0.2;0.08" dur="3s" repeatCount="indefinite" />
        </ellipse>
      )}

      {/* Label */}
      <text x={0} y={40} textAnchor="middle" fill={color} fontSize="8" fontWeight="700" fontFamily="Orbitron, sans-serif" letterSpacing="0.1em">
        {dormant ? "STANDBY" : isOnline ? "VALVE OPEN" : "VALVE SHUT"}
      </text>
    </g>
  );
}

function CentralDBNode({ x, y, count, isOnline, isRunning, isMeshGatewayActive = false }: {
  x: number;
  y: number;
  count: number;
  isOnline: boolean;
  isRunning: boolean;
  isMeshGatewayActive?: boolean;
}) {
  const dormant = !isRunning;
  const color = dormant ? "var(--eg-muted)" : isOnline || isMeshGatewayActive ? "var(--eg-flow)" : "var(--eg-muted)";
  const opacity = dormant ? 0.35 : isOnline || isMeshGatewayActive ? 1 : 0.4;

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
      {(isOnline || isMeshGatewayActive) && isRunning && (
        <ellipse cx={0} cy={0} rx={36} ry={28} fill="none" stroke="var(--eg-flow)" strokeWidth={0.5} opacity={0.15}>
          <animate attributeName="opacity" values="0.08;0.2;0.08" dur="3s" repeatCount="indefinite" />
        </ellipse>
      )}

      {/* Labels */}
      <text x={0} y={48} textAnchor="middle" fill={dormant ? "var(--eg-muted)" : isOnline || isMeshGatewayActive ? "var(--eg-text-dim)" : "var(--eg-muted)"} fontSize="8" fontWeight="600" fontFamily="Orbitron, sans-serif" letterSpacing="0.1em">
        CENTRAL DB
      </text>
      {!isOnline && isRunning && (
        <text x={0} y={60} textAnchor="middle" fill={isMeshGatewayActive ? "var(--eg-flow)" : "var(--eg-anomaly)"} fontSize="7" fontWeight="700" fontFamily="Orbitron, sans-serif" opacity={0.8}>
          {isMeshGatewayActive ? "MESH LINK" : "UNREACHABLE"}
        </text>
      )}
    </g>
  );
}

export function PipelineView() {
  const edgeStorage = usePipelineStore((s) => s.edgeStorage);
  const centralStorage = usePipelineStore((s) => s.centralStorage);
  const isOnline = usePipelineStore((s) => s.isOnline);
  const isRunning = usePipelineStore((s) => s.isRunning);
  const forcedAnomalyTurbine = usePipelineStore((s) => s.forcedAnomalyTurbine);
  const enabledTurbines = usePipelineStore((s) => s.enabledTurbines);
  const compactionCount = usePipelineStore((s) => s.compactionCount);
  const edgePressure = usePipelineStore((s) => s.edgePressure);
  const isMeshGatewayActive = usePipelineStore((s) => s.meshGatewayOverride ?? s.status.isMeshGatewayActive ?? false);
  const [pendingAnomalyTurbine, setPendingAnomalyTurbine] = useState<number | null>(null);
  const pendingAnomalyPosition = useMemo(() => {
    if (pendingAnomalyTurbine == null) return null;
    const pos = TURBINE_POSITIONS[Math.max(0, Math.min(2, pendingAnomalyTurbine - 1))];
    return {
      start: { x: pos.x, y: pos.y + 4 },
      via: { x: PIPE_START_X, y: PIPE_Y },
      end: { x: BUFFER_X - 6, y: PIPE_Y },
    };
  }, [pendingAnomalyTurbine]);
  const setOnline = (online: boolean) => {
    edgeguardApi.setConnection(online).catch(() => {});
  };
  const setForcedAnomalyTurbine = (id: number | null) => {
    if (id != null) {
      setPendingAnomalyTurbine(id);
      edgeguardApi.injectAnomaly(id).catch(() => {});
    } else if (forcedAnomalyTurbine != null) {
      edgeguardApi.clearAnomaly(forcedAnomalyTurbine).catch(() => {});
      setPendingAnomalyTurbine(null);
    }
    usePipelineStore.setState({ forcedAnomalyTurbine: id });
  };

  useEffect(() => {
    if (pendingAnomalyTurbine == null) return;
    const timer = setTimeout(() => setPendingAnomalyTurbine(null), 1600);
    return () => clearTimeout(timer);
  }, [pendingAnomalyTurbine]);

  useEffect(() => {
    if (forcedAnomalyTurbine == null) return;
    const timer = setTimeout(() => {
      usePipelineStore.setState({ forcedAnomalyTurbine: null });
    }, 8500);
    return () => clearTimeout(timer);
  }, [forcedAnomalyTurbine]);

  const [compactionFlash, setCompactionFlash] = useState(false);
  useEffect(() => {
    if (compactionCount === 0) return;
    setCompactionFlash(true);
    const timer = setTimeout(() => setCompactionFlash(false), 500);
    return () => clearTimeout(timer);
  }, [compactionCount]);

  const bufferRatio = Math.min(1, edgeStorage.length / EDGE_CAPACITY);
  const inCompactionZone = bufferRatio >= COMPACTION_THRESHOLD / EDGE_CAPACITY;

  return (
    <div className="w-full">
      <div className="relative rounded-xl border border-[var(--eg-border)] bg-[var(--eg-panel)] overflow-hidden shadow-[0_8px_60px_rgba(0,0,0,0.6)]">
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
            <path
              d={PIPE_PATH_LEFT}
              fill="none"
              stroke={edgePressure > 0.5 ? "var(--eg-alert)" : "var(--eg-flow)"}
              strokeWidth={2}
              className="pipe-flow-anim"
              opacity={0.6}
            />
          )}

          <path d={PIPE_PATH_RIGHT} fill="none" stroke={isRunning ? "var(--eg-border)" : "var(--eg-muted)"} strokeWidth={20} strokeLinecap="round" opacity={isRunning ? 1 : 0.3} />
          {isRunning && (
            <path
              d={PIPE_PATH_RIGHT}
              fill="none"
              stroke={isMeshGatewayActive ? "var(--eg-border)" : isOnline ? "url(#pipe-glow-right-on)" : "url(#pipe-glow-right-off)"}
              strokeWidth={10}
              strokeLinecap="round"
              opacity={isMeshGatewayActive ? 0.18 : 1}
            />
          )}
          {isOnline && isRunning && !isMeshGatewayActive && (
            <path
              d={PIPE_PATH_RIGHT}
              fill="none"
              stroke="var(--eg-flow)"
              strokeWidth={2}
              className="pipe-flow-anim"
              opacity={0.4}
            />
          )}

          {/* Section labels */}
          {isRunning && (
            <>
              <text x={PIPE_START_X + 15} y={PIPE_Y - 18} fill="var(--eg-text-dim)" fontSize="7" fontFamily="Orbitron, sans-serif" letterSpacing="0.15em" opacity={0.5}>
                INGEST
              </text>
              <text x={VALVE_X + 40} y={PIPE_Y - 18} fill="var(--eg-text-dim)" fontSize="7" fontFamily="Orbitron, sans-serif" letterSpacing="0.15em" opacity={isMeshGatewayActive ? 0.5 : isOnline ? 0.5 : 0.2}>
                {isMeshGatewayActive ? "MESH AIRLIFT" : "CLOUD SYNC"}
              </text>
            </>
          )}

          {isMeshGatewayActive && isRunning && !isOnline && (
            <g opacity={0.85}>
              <motion.path
                d={`M ${BUFFER_X - 6} ${PIPE_Y - 10} C ${BUFFER_X + 86} ${PIPE_Y - 84}, ${CENTRAL_X - 118} ${PIPE_Y - 110}, ${CENTRAL_X - 8} ${PIPE_Y - 26}`}
                fill="none"
                stroke="var(--eg-flow)"
                strokeWidth={1.4}
                strokeDasharray="7 8"
                initial={{ pathLength: 0.2, opacity: 0.15 }}
                animate={{ pathLength: 1, opacity: [0.18, 0.45, 0.18], strokeDashoffset: [0, -24] }}
                transition={{
                  pathLength: { duration: 0.7, ease: "easeOut" },
                  opacity: { duration: 2.2, repeat: Infinity, ease: "easeInOut" },
                  strokeDashoffset: { duration: 1.6, repeat: Infinity, ease: "linear" },
                }}
              />
              <motion.g
                initial={{ opacity: 0, scale: 0.92, x: 0, y: 0 }}
                animate={{ opacity: [0.72, 1, 0.72], scale: [1, 1.03, 1], x: [0, 10, 0], y: [0, -6, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              >
                <ellipse cx={BUFFER_X + 48} cy={PIPE_Y - 44} rx={18} ry={5} fill="var(--eg-flow)" opacity={0.12} />
                <foreignObject x={BUFFER_X + 26} y={PIPE_Y - 94} width={44} height={44}>
                  <div className="flex h-full w-full items-center justify-center">
                    <Plane className="h-9 w-9 text-[var(--eg-flow)] drop-shadow-[0_0_10px_rgba(32,113,181,0.28)]" strokeWidth={2} />
                  </div>
                </foreignObject>
              </motion.g>
            </g>
          )}

          {/* === PACKETS / PARTICLES === */}
          <PacketLayer />
          {pendingAnomalyPosition && (
            <g filter="url(#glow-cyan)">
              <motion.circle
                initial={{ cx: pendingAnomalyPosition.start.x - 10, cy: pendingAnomalyPosition.start.y }}
                animate={{
                  cx: [pendingAnomalyPosition.start.x - 10, pendingAnomalyPosition.via.x - 10, pendingAnomalyPosition.end.x - 10],
                  cy: [pendingAnomalyPosition.start.y, pendingAnomalyPosition.via.y, pendingAnomalyPosition.end.y],
                }}
                transition={{ duration: 0.72, ease: "linear", times: [0, 0.26, 1] }}
                r={3.2}
                fill="var(--eg-flow)"
                opacity={0.16}
              />
              <motion.circle
                initial={{ cx: pendingAnomalyPosition.start.x - 4, cy: pendingAnomalyPosition.start.y }}
                animate={{
                  cx: [pendingAnomalyPosition.start.x - 4, pendingAnomalyPosition.via.x - 4, pendingAnomalyPosition.end.x - 4],
                  cy: [pendingAnomalyPosition.start.y, pendingAnomalyPosition.via.y, pendingAnomalyPosition.end.y],
                }}
                transition={{ duration: 0.72, ease: "linear", times: [0, 0.26, 1] }}
                r={4.6}
                fill="var(--eg-flow)"
                opacity={0.35}
              />
              <motion.circle
                initial={{ cx: pendingAnomalyPosition.start.x, cy: pendingAnomalyPosition.start.y }}
                animate={{
                  cx: [pendingAnomalyPosition.start.x, pendingAnomalyPosition.via.x, pendingAnomalyPosition.end.x],
                  cy: [pendingAnomalyPosition.start.y, pendingAnomalyPosition.via.y, pendingAnomalyPosition.end.y],
                }}
                transition={{ duration: 0.72, ease: "linear", times: [0, 0.26, 1] }}
                r={5.8}
                fill="var(--eg-flow)"
                opacity={0.95}
              />
            </g>
          )}

          <AnimatePresence>
            {!isOnline && isRunning && !isMeshGatewayActive && (
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <rect x={300} y={20} width={500} height={26} rx={13} fill="rgba(211, 64, 61, 0.12)" stroke="rgba(211, 64, 61, 0.35)" />
                <text
                  x={550}
                  y={37}
                  textAnchor="middle"
                  fill="var(--eg-anomaly)"
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="Orbitron, sans-serif"
                  letterSpacing="0.24em"
                >
                  NETWORK DISCONNECTED  EDGE ISOLATION MODE
                </text>
              </motion.g>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!isOnline && isRunning && isMeshGatewayActive && (
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <rect x={332} y={20} width={436} height={26} rx={13} fill="rgba(32, 113, 181, 0.1)" stroke="rgba(32, 113, 181, 0.28)" />
                <text
                  x={550}
                  y={37}
                  textAnchor="middle"
                  fill="var(--eg-flow)"
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="Orbitron, sans-serif"
                  letterSpacing="0.2em"
                >
                  MESH GATEWAY ACTIVE  AIRLIFTING EDGE BUFFER
                </text>
              </motion.g>
            )}
          </AnimatePresence>

          {/* === TURBINES (triangular formation) === */}
          {TURBINE_POSITIONS.map((pos, index) => {
            const turbineId = index + 1;
            const active = forcedAnomalyTurbine === turbineId || pendingAnomalyTurbine === turbineId;
            const enabled = enabledTurbines.includes(turbineId);
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
                enabled={enabled}
                onActivate={() => setForcedAnomalyTurbine(active ? null : turbineId)}
              />
            );
          })}

          {/* === EDGE AI CHIP === */}
          <EdgeAIChip isRunning={isRunning} />

          {/* === BUFFER TANK === */}
          <BufferTank
            x={BUFFER_X}
            y={PIPE_Y}
            ratio={bufferRatio}
            inCompactionZone={inCompactionZone}
            compactionFlash={compactionFlash}
            isRunning={isRunning}
            items={edgeStorage}
            pendingAnomalyCount={pendingAnomalyTurbine != null ? 1 : 0}
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
            isMeshGatewayActive={isMeshGatewayActive}
          />
        </svg>

      </div>
    </div>
  );
}
