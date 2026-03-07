import type { ReactNode } from "react";
import { usePipelineStore } from "~/stores/pipelineStore";
import type { EdgeGuardItem } from "~/types/edgeguard";
import { isCompactedBlock, isDataPoint } from "~/types/edgeguard";

const MAX_ROWS = 10;

function itemKey(item: EdgeGuardItem, index: number): string {
  if (isDataPoint(item)) return item.id;
  if (isCompactedBlock(item)) return `compact_${item.range}_${item.tier}`;
  return `item_${index}`;
}

function TableShell({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
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

      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function DataRow({
  item,
}: {
  item: EdgeGuardItem;
}) {
  if (isDataPoint(item)) {
    const isAnomaly = item.type === "anomaly";
    return (
      <div className={`grid h-8 grid-cols-[50px_40px_60px_60px_60px] gap-1 border-b border-[var(--eg-border)]/40 px-2 text-[11px] font-mono leading-8 ${isAnomaly ? "bg-[var(--eg-anomaly)]/5" : ""}`}>
        <span className="text-[var(--eg-text-dim)]">#{item.seq}</span>
        <span className="text-[var(--eg-text-dim)]">T{item.sourceTurbine}</span>
        <span className="text-[var(--eg-text-bright)]">{item.value.toFixed(0)}</span>
        <span className="font-bold" style={{ color: isAnomaly ? "var(--eg-anomaly)" : "var(--eg-ok)" }}>
          {item.anomalyScore.toFixed(3)}
        </span>
        <span className={`font-bold ${isAnomaly ? "text-[var(--eg-anomaly)]" : "text-[var(--eg-ok)]"}`}>
          {isAnomaly ? "ANOMALY" : "NORMAL"}
        </span>
      </div>
    );
  }

  if (isCompactedBlock(item)) {
    const tierColor = item.tier === 2 ? "#9b62c3" : "#7f8fd4";
    return (
      <div
        className="grid h-8 grid-cols-[50px_40px_60px_60px_60px] gap-1 border-b border-[var(--eg-border)]/40 px-2 text-[11px] font-mono leading-8"
        style={{ backgroundColor: `${tierColor}08` }}
      >
        <span className="font-bold" style={{ color: tierColor }}>[{item.range}]</span>
        <span style={{ color: tierColor }}>T{item.tier}</span>
        <span className="text-[var(--eg-text-bright)]">{item.avgValue.toFixed(0)}</span>
        <span className="text-[var(--eg-text-dim)]">{item.count}pts</span>
        <span className="font-bold" style={{ color: tierColor }}>COMPACT</span>
      </div>
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
  const visible = items.slice(-MAX_ROWS).reverse();
  const emptyRows = Math.max(0, MAX_ROWS - visible.length);

  return (
    <TableShell title={title} count={items.length}>
      <div className="grid grid-rows-[repeat(10,minmax(0,2rem))]">
        {visible.map((item, i) => {
          const key = itemKey(item, items.length - 1 - i);
          return <DataRow key={key} item={item} />;
        })}
        {Array.from({ length: emptyRows }, (_, i) => (
          <div
            key={`empty-${i}`}
            className="grid h-8 grid-cols-[50px_40px_60px_60px_60px] gap-1 border-b border-[var(--eg-border)]/20 px-2 text-[11px] font-mono leading-8 text-transparent"
          >
            <span>0</span>
            <span>0</span>
            <span>0</span>
            <span>0</span>
            <span>0</span>
          </div>
        ))}
      </div>
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
