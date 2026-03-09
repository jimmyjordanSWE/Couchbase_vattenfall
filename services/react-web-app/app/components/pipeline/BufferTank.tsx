import { useMemo } from "react";
import { EDGE_CAPACITY } from "~/stores/pipelineStore";
import type { EdgeGuardItem } from "~/types/edgeguard";
import { isCompactedBlock, isDataPoint } from "~/types/edgeguard";

export function BufferTank({
  x,
  y,
  ratio,
  inCompactionZone,
  compactionFlash,
  isRunning,
  items,
  pendingAnomalyCount = 0,
}: {
  x: number;
  y: number;
  ratio: number;
  inCompactionZone: boolean;
  compactionFlash: boolean;
  isRunning: boolean;
  items: EdgeGuardItem[];
  pendingAnomalyCount?: number;
}) {
  const tankH = 120;
  const tankW = 70;
  const dormant = !isRunning;
  const fluidColor = dormant
    ? "var(--eg-muted)"
    : inCompactionZone
      ? "var(--eg-alert)"
      : ratio > 0.6
        ? "var(--eg-alert)"
        : "var(--eg-flow)";
  const { anomalyCount, normalLikeCount, compactedCount } = useMemo(() => {
    const anomalyItems = items.filter((item) => isDataPoint(item) && item.type === "anomaly");
    const compactedItems = items.filter(isCompactedBlock);
    const normalItems = items.filter((item) => isDataPoint(item) && item.type === "normal");
    return {
      anomalyCount: anomalyItems.length + pendingAnomalyCount,
      normalLikeCount: normalItems.length,
      compactedCount: compactedItems.length,
    };
  }, [items, pendingAnomalyCount, tankH]);
  const normalFluidH = (normalLikeCount / EDGE_CAPACITY) * (tankH - 8);
  const compactedFluidH = (compactedCount / EDGE_CAPACITY) * (tankH - 8);
  const anomalyFluidH = (anomalyCount / EDGE_CAPACITY) * (tankH - 8);
  const fluidBaseY = tankH / 2 - 2;
  const totalFluidH = Math.min(tankH - 8, normalFluidH + compactedFluidH + anomalyFluidH);
  const compactedTopY = fluidBaseY - normalFluidH - compactedFluidH;
  const anomalyTopY = fluidBaseY - normalFluidH - compactedFluidH - anomalyFluidH;
  const surfaceY = fluidBaseY - totalFluidH;
  const surfaceColor = anomalyCount > 0
    ? "var(--eg-anomaly)"
    : compactedCount > 0
      ? "#b388ff"
      : fluidColor;

  return (
    <g transform={`translate(${x}, ${y})`} opacity={dormant ? 0.4 : 1}>
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

      <defs>
        <linearGradient id="buffer-fluid" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={fluidColor} stopOpacity="0.85" />
          <stop offset="100%" stopColor={fluidColor} stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="buffer-fluid-compacted" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#b388ff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#b388ff" stopOpacity="0.34" />
        </linearGradient>
        <linearGradient id="buffer-fluid-anomaly" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--eg-anomaly)" stopOpacity="0.92" />
          <stop offset="100%" stopColor="var(--eg-anomaly)" stopOpacity="0.42" />
        </linearGradient>
        <clipPath id="tank-clip">
          <rect x={-tankW / 2 + 2} y={-tankH / 2 + 2} width={tankW - 4} height={tankH - 4} rx={5} />
        </clipPath>
      </defs>

      <g clipPath="url(#tank-clip)">
        <rect
          x={-tankW / 2 + 2}
          y={fluidBaseY - normalFluidH}
          width={tankW - 4}
          height={normalFluidH}
          fill="url(#buffer-fluid)"
          opacity={normalFluidH > 0 ? 1 : 0}
        />
        <rect
          x={-tankW / 2 + 2}
          y={compactedTopY}
          width={tankW - 4}
          height={compactedFluidH}
          fill="url(#buffer-fluid-compacted)"
          opacity={compactedCount > 0 ? 0.95 : 0}
        />
        <rect
          x={-tankW / 2 + 2}
          y={anomalyTopY}
          width={tankW - 4}
          height={anomalyFluidH}
          fill="url(#buffer-fluid-anomaly)"
          opacity={anomalyCount > 0 ? 0.95 : 0}
        />
        {totalFluidH > 2 && isRunning && (
          <path
            d={`M ${-tankW / 2 + 2} ${surfaceY} Q ${-tankW / 4} ${surfaceY - 3} 0 ${surfaceY} Q ${tankW / 4} ${surfaceY + 3} ${tankW / 2 - 2} ${surfaceY}`}
            fill={surfaceColor}
            opacity={0.4}
          >
            <animate
              attributeName="d"
              values={`M ${-tankW / 2 + 2} ${surfaceY} Q ${-tankW / 4} ${surfaceY - 3} 0 ${surfaceY} Q ${tankW / 4} ${surfaceY + 3} ${tankW / 2 - 2} ${surfaceY};M ${-tankW / 2 + 2} ${surfaceY} Q ${-tankW / 4} ${surfaceY + 3} 0 ${surfaceY} Q ${tankW / 4} ${surfaceY - 3} ${tankW / 2 - 2} ${surfaceY};M ${-tankW / 2 + 2} ${surfaceY} Q ${-tankW / 4} ${surfaceY - 3} 0 ${surfaceY} Q ${tankW / 4} ${surfaceY + 3} ${tankW / 2 - 2} ${surfaceY}`}
              dur="2s"
              repeatCount="indefinite"
            />
          </path>
        )}
      </g>

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

      <g transform="translate(0, -48)">
        <ellipse cx={0} cy={0} rx={10} ry={3} fill="none" stroke={dormant ? "var(--eg-muted)" : "var(--eg-flow)"} strokeWidth={0.6} opacity={0.4} />
        <rect x={-10} y={0} width={20} height={10} fill="none" stroke={dormant ? "var(--eg-muted)" : "var(--eg-flow)"} strokeWidth={0.6} opacity={0.3} />
        <ellipse cx={0} cy={10} rx={10} ry={3} fill="none" stroke={dormant ? "var(--eg-muted)" : "var(--eg-flow)"} strokeWidth={0.6} opacity={0.4} />
      </g>

      <text x={0} y={tankH / 2 + 16} textAnchor="middle" fill={dormant ? "var(--eg-muted)" : inCompactionZone ? "var(--eg-anomaly)" : "var(--eg-text-dim)"} fontSize="8" fontWeight="600" fontFamily="Orbitron, sans-serif" letterSpacing="0.1em">
        EDGE COUCHBASE
      </text>
      <text x={0} y={tankH / 2 + 28} textAnchor="middle" fill={dormant ? "var(--eg-muted)" : inCompactionZone ? "var(--eg-anomaly)" : "var(--eg-flow)"} fontSize="9" fontWeight="700" fontFamily="JetBrains Mono, monospace">
        {Math.round(ratio * 100)}%
      </text>
      {anomalyCount > 0 && (
        <text x={0} y={-tankH / 2 - 10} textAnchor="middle" fill="var(--eg-anomaly)" fontSize="8" fontWeight="700" fontFamily="JetBrains Mono, monospace" letterSpacing="0.08em">
          ANOMALIES HELD {anomalyCount}
        </text>
      )}
    </g>
  );
}
