import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePipelineStore } from "~/stores/pipelineStore";
import type { EdgeGuardItem } from "~/types/edgeguard";
import { isCompactedBlock, isDataPoint, SENSOR_RANGES, sensorColor } from "~/types/edgeguard";

const MAX_ROWS = 10;

function SensorDetailPanel({ sensors }: { sensors: NonNullable<import("~/types/edgeguard").DataPoint["sensors"]> }) {
  const keys = ["temperature", "vibration", "rpm", "powerOutput", "windSpeed", "bladePitch"] as const;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: "easeInOut" }}
      className="overflow-hidden"
    >
      <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 border-t border-[var(--eg-border)]/40 bg-[var(--eg-surface)]/50 px-2 py-2">
        {keys.map((key) => {
          const meta = SENSOR_RANGES[key];
          const value = sensors[key];
          const color = sensorColor(key, value);
          const span = meta.max - meta.min;
          const fraction = Math.max(0, Math.min(1, (value - meta.min) / span));

          return (
            <div key={key} className="flex flex-col gap-[2px]">
              <div className="flex items-center justify-between">
                <span className="font-display text-[8px] tracking-[0.02em] text-[var(--eg-text-dim)]">
                  {meta.label}
                </span>
                <span className="font-mono text-[9px] font-semibold" style={{ color }}>
                  {value % 1 === 0 ? value : value.toFixed(1)}
                  <span className="ml-[1px] text-[7px] text-[var(--eg-text-dim)]">{meta.unit}</span>
                </span>
              </div>
              <div className="h-[2px] overflow-hidden rounded-full bg-[var(--eg-border)]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${fraction * 100}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function itemKey(item: EdgeGuardItem, index: number): string {
  if (isDataPoint(item)) return item.id;
  if (isCompactedBlock(item)) return `compact_${item.range}_${item.tier}`;
  return `item_${index}`;
}

function TableShell({
  title,
  count,
  children,
  scrollRef,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="eg-panel flex min-h-[340px] min-w-0 flex-1 flex-col p-5">
      <div className="mb-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
            <ellipse cx="7" cy="3" rx="6" ry="2" fill="none" stroke="var(--eg-flow)" strokeWidth="1" />
            <rect x="1" y="3" width="12" height="8" fill="none" stroke="var(--eg-flow)" strokeWidth="1" />
            <ellipse cx="7" cy="11" rx="6" ry="2" fill="none" stroke="var(--eg-flow)" strokeWidth="1" />
          </svg>
          <span className="font-display text-[15px] font-semibold tracking-[0.02em] text-[var(--eg-text-bright)]">
            {title}
          </span>
        </div>
        <span className="font-mono text-[12px] text-[var(--eg-text-dim)]">{count} items</span>
      </div>

      <div className="grid shrink-0 grid-cols-[50px_40px_60px_60px_60px] gap-1 border-b border-[var(--eg-border)] px-2 py-2 text-[11px] font-display tracking-[0.02em] text-[var(--eg-text-dim)]">
        <span>SEQ</span>
        <span>SRC</span>
        <span>VALUE</span>
        <span>SCORE</span>
        <span>TYPE</span>
      </div>

      <div ref={scrollRef} className="eg-scrollbar min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="popLayout" initial={false}>
          {children}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DataRow({
  item,
  isExpanded,
  onToggle,
}: {
  item: EdgeGuardItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  if (isDataPoint(item)) {
    const isAnomaly = item.type === "anomaly";
    const hasSensors = item.sensors != null;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.15 }}
        className={`border-b border-[var(--eg-border)]/40 ${isAnomaly ? "bg-[var(--eg-anomaly)]/5" : ""}`}
      >
        <div
          className={`grid grid-cols-[50px_40px_60px_60px_60px] gap-1 px-2 py-2 text-[11px] font-mono ${hasSensors ? "cursor-pointer hover:bg-[var(--eg-flow)]/4" : ""}`}
          onClick={hasSensors ? onToggle : undefined}
        >
          <span className="text-[var(--eg-text-dim)]">#{item.seq}</span>
          <span className="text-[var(--eg-text-dim)]">T{item.sourceTurbine}</span>
          <span className="text-[var(--eg-text-bright)]">{item.value.toFixed(0)}</span>
          <span className="font-bold" style={{ color: isAnomaly ? "var(--eg-anomaly)" : "var(--eg-ok)" }}>
            {item.anomalyScore.toFixed(3)}
          </span>
          <div className="flex items-center gap-1">
            <span className={`font-bold ${isAnomaly ? "text-[var(--eg-anomaly)]" : "text-[var(--eg-ok)]"}`}>
              {isAnomaly ? "ANOMALY" : "NORMAL"}
            </span>
            {hasSensors && (
              <span className="ml-auto text-[8px] text-[var(--eg-text-dim)]">
                {isExpanded ? "▲" : "▼"}
              </span>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && hasSensors && <SensorDetailPanel sensors={item.sensors} />}
        </AnimatePresence>
      </motion.div>
    );
  }

  if (isCompactedBlock(item)) {
    const tierColor = item.tier === 2 ? "#9b62c3" : "#7f8fd4";
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.15 }}
        className="grid grid-cols-[50px_40px_60px_60px_60px] gap-1 border-b border-[var(--eg-border)]/40 px-2 py-2 text-[11px] font-mono"
        style={{ backgroundColor: `${tierColor}08` }}
      >
        <span className="font-bold" style={{ color: tierColor }}>[{item.range}]</span>
        <span style={{ color: tierColor }}>T{item.tier}</span>
        <span className="text-[var(--eg-text-bright)]">{item.avgValue.toFixed(0)}</span>
        <span className="text-[var(--eg-text-dim)]">{item.count}pts</span>
        <span className="font-bold" style={{ color: tierColor }}>COMPACT</span>
      </motion.div>
    );
  }

  return null;
}

function DataTable({
  title,
  items,
}: {
  title: string;
  items: EdgeGuardItem[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const visible = items.slice(-MAX_ROWS);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setExpanded(null);
  }, [items.length]);

  return (
    <TableShell title={title} count={items.length} scrollRef={scrollRef}>
      {visible.map((item, i) => {
        const key = itemKey(item, items.length - MAX_ROWS + i);
        return (
          <DataRow
            key={key}
            item={item}
            isExpanded={expanded === key}
            onToggle={() => setExpanded(expanded === key ? null : key)}
          />
        );
      })}
      {items.length === 0 && (
        <div className="py-6 text-center font-mono text-[11px] text-[var(--eg-muted)]">NO DATA</div>
      )}
    </TableShell>
  );
}

export function EdgeDataTable() {
  const edgeStorage = usePipelineStore((s) => s.edgeStorage);
  return <DataTable title="EDGE LOGS" items={edgeStorage} />;
}

export function CentralDataTable() {
  const centralStorage = usePipelineStore((s) => s.centralStorage);
  return <DataTable title="CENTRAL LOGS" items={centralStorage} />;
}
