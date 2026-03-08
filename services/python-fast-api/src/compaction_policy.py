from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any

from models.edgeguard import CompactedBlock, CompactionLogEntry, DataPoint


@dataclass
class CompactionPolicyConfig:
    threshold: int
    tier1_window_size: int
    tier2_merge_count: int


@dataclass
class CompactionDecision:
    changed: bool
    edge_storage: list[dict[str, Any]]
    log_entry: dict[str, Any] | None
    persisted_blocks: list[dict[str, Any]]


def _now_ms() -> int:
    return int(time.time() * 1000)


def _std_dev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    sq = sum((v - mean) ** 2 for v in values)
    return math.sqrt(sq / (len(values) - 1))


def _compact_window(points: list[DataPoint]) -> CompactedBlock:
    values = [p.value for p in points]
    seqs = [p.seq for p in points]
    return CompactedBlock(
        avgValue=sum(values) / len(values),
        minValue=min(values),
        maxValue=max(values),
        stdDev=_std_dev(values),
        count=len(points),
        range=f"{min(seqs)}-{max(seqs)}",
        tier=1,
    )


def _merge_tier1_blocks(blocks: list[CompactedBlock]) -> CompactedBlock:
    total_count = sum(b.count for b in blocks)
    weighted_avg = sum(b.avg_value * b.count for b in blocks) / total_count
    all_seqs: list[int] = []
    for block in blocks:
        start, end = block.range.split("-")
        all_seqs.extend([int(start), int(end)])
    return CompactedBlock(
        avgValue=weighted_avg,
        minValue=min(b.min_value for b in blocks),
        maxValue=max(b.max_value for b in blocks),
        stdDev=max(b.std_dev for b in blocks),
        count=total_count,
        range=f"{min(all_seqs)}-{max(all_seqs)}",
        tier=2,
    )


def compact_edge_buffer(
    edge_storage: list[dict[str, Any]],
    *,
    is_online: bool,
    config: CompactionPolicyConfig,
) -> CompactionDecision:
    if is_online or len(edge_storage) <= config.threshold:
        return CompactionDecision(
            changed=False,
            edge_storage=edge_storage,
            log_entry=None,
            persisted_blocks=[],
        )

    anomalies: list[dict[str, Any]] = []
    existing_compacted: list[CompactedBlock] = []
    normals: list[DataPoint] = []

    for item in edge_storage:
        if item.get("type") == "compacted":
            existing_compacted.append(CompactedBlock.model_validate(item))
            continue

        if "anomalyScore" in item:
            point = DataPoint.model_validate(item)
            if point.type == "anomaly":
                anomalies.append(item)
            else:
                normals.append(point)
            continue

        anomalies.append(item)

    if len(normals) < config.tier1_window_size:
        tier1 = [block for block in existing_compacted if block.tier == 1]
        tier2 = [block for block in existing_compacted if block.tier == 2]
        if len(tier1) < config.tier2_merge_count:
            return CompactionDecision(
                changed=False,
                edge_storage=edge_storage,
                log_entry=None,
                persisted_blocks=[],
            )

        to_merge = tier1[: config.tier2_merge_count]
        remaining = tier1[config.tier2_merge_count :]
        merged = _merge_tier1_blocks(to_merge)
        new_edge = (
            anomalies
            + [block.model_dump(by_alias=True) for block in tier2]
            + [block.model_dump(by_alias=True) for block in remaining]
            + [point.model_dump(by_alias=True) for point in normals]
            + [merged.model_dump(by_alias=True)]
        )
        log_entry = CompactionLogEntry(
            message=(
                f"T2 MERGE {len(to_merge)} blocks -> 1 | "
                f"SEQ {merged.range} | {merged.count} pts | "
                f"AVG {merged.avg_value:.1f}"
            ),
            timestamp=_now_ms(),
            severity="compaction",
        ).model_dump(by_alias=True)
        return CompactionDecision(
            changed=True,
            edge_storage=new_edge,
            log_entry=log_entry,
            persisted_blocks=[merged.model_dump(by_alias=True)],
        )

    new_blocks: list[CompactedBlock] = []
    log_parts: list[str] = []
    index = 0
    while index + config.tier1_window_size <= len(normals):
        window = normals[index : index + config.tier1_window_size]
        block = _compact_window(window)
        new_blocks.append(block)
        log_parts.append(f"[{block.range}]")
        index += config.tier1_window_size

    leftover_normals = normals[index:]
    if not new_blocks:
        return CompactionDecision(
            changed=False,
            edge_storage=edge_storage,
            log_entry=None,
            persisted_blocks=[],
        )

    new_edge = (
        anomalies
        + [block.model_dump(by_alias=True) for block in existing_compacted]
        + [point.model_dump(by_alias=True) for point in leftover_normals]
        + [block.model_dump(by_alias=True) for block in new_blocks]
    )
    compacted_pts = len(normals) - len(leftover_normals)
    log_entry = CompactionLogEntry(
        message=(
            f"T1 COMPACT {' '.join(log_parts)} | "
            f"{compacted_pts} pts -> {len(new_blocks)} blocks"
        ),
        timestamp=_now_ms(),
        severity="compaction",
    ).model_dump(by_alias=True)
    return CompactionDecision(
        changed=True,
        edge_storage=new_edge,
        log_entry=log_entry,
        persisted_blocks=[block.model_dump(by_alias=True) for block in new_blocks],
    )
