"use client";

import { useState } from "react";
import type { PlaybackUnit } from "@/features/content/types";
import {
  UNIT_STATUS_LABELS,
  type UnitDisplayStatus,
} from "@/features/review/review-queue";

type SectionNavProps = {
  units: PlaybackUnit[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  statusByUnitId: Record<string, UnitDisplayStatus>;
  actionableByUnitId: Record<string, boolean>;
};

// Order used to pick the group-level status: the "worst" unit wins.
const STATUS_PRIORITY: UnitDisplayStatus[] = [
  "failed",
  "review",
  "inconclusive",
  "reviewing",
  "queued",
  "unreviewed",
  "pass",
];

function aggregateStatus(
  groupUnits: PlaybackUnit[],
  statusByUnitId: Record<string, UnitDisplayStatus>,
): UnitDisplayStatus {
  let worst: UnitDisplayStatus = "pass";
  let worstRank = STATUS_PRIORITY.length;
  for (const unit of groupUnits) {
    const status = statusByUnitId[unit.id] ?? "unreviewed";
    const rank = STATUS_PRIORITY.indexOf(status);
    if (rank !== -1 && rank < worstRank) {
      worstRank = rank;
      worst = status;
    }
  }
  return worst;
}

function StatusChip({ status }: { status: UnitDisplayStatus }) {
  // Hide the chip for untouched units to keep the list scannable.
  if (status === "unreviewed") return null;
  return (
    <span className={`nav-status nav-status-${status}`}>
      {UNIT_STATUS_LABELS[status]}
    </span>
  );
}

export function SectionNav({
  units,
  selectedIndex,
  onSelect,
  statusByUnitId,
  actionableByUnitId,
}: SectionNavProps) {
  const [actionableOnly, setActionableOnly] = useState(false);

  // Group units by groupId
  const groups = units.reduce<Record<string, PlaybackUnit[]>>(
    (acc, unit) => {
      if (!acc[unit.groupId]) {
        acc[unit.groupId] = [];
      }
      acc[unit.groupId].push(unit);
      return acc;
    },
    {},
  );

  const groupIds = Object.keys(groups);
  const visibleGroupIds = actionableOnly
    ? groupIds.filter((groupId) =>
        groups[groupId].some((unit) => actionableByUnitId[unit.id]),
      )
    : groupIds;

  return (
    <nav className="section-nav" aria-label="セクションナビゲーション">
      <div className="section-nav-header">
        <h3>セクション一覧</h3>
        <button
          type="button"
          onClick={() => setActionableOnly((prev) => !prev)}
          aria-pressed={actionableOnly}
          className={`btn btn-small btn-toggle ${actionableOnly ? "active" : ""}`}
          data-testid="actionable-filter"
        >
          要対応のみ
        </button>
      </div>
      {actionableOnly && visibleGroupIds.length === 0 && (
        <p className="nav-empty">要対応のセクションはありません</p>
      )}
      <ul className="nav-list">
        {visibleGroupIds.map((groupId) => {
          const groupUnits = groups[groupId];
          const firstUnit = groupUnits[0];
          const isGroupSelected = groupUnits.some(
            (u) => u.order === selectedIndex,
          );
          const groupStatus = aggregateStatus(groupUnits, statusByUnitId);

          return (
            <li key={groupId} className="nav-group">
              <button
                type="button"
                className={`nav-group-header ${isGroupSelected ? "selected" : ""}`}
                onClick={() => onSelect(firstUnit.order)}
                aria-current={isGroupSelected ? "true" : undefined}
              >
                <span className="nav-group-title">{groupId}</span>
                <StatusChip status={groupStatus} />
                <span className="nav-count">
                  {groupUnits.length}ユニット
                </span>
              </button>
              {isGroupSelected && groupUnits.length > 1 && (
                <ul className="nav-sublist">
                  {groupUnits.map((unit) => (
                    <li key={unit.id}>
                      <button
                        type="button"
                        className={`nav-item ${unit.order === selectedIndex ? "selected" : ""}`}
                        onClick={() => onSelect(unit.order)}
                        aria-current={
                          unit.order === selectedIndex ? "true" : undefined
                        }
                      >
                        <span className="nav-kind">{unit.kind}</span>
                        <span className="nav-text">
                          {unit.displayText.slice(0, 30)}
                          {unit.displayText.length > 30 ? "..." : ""}
                        </span>
                        <StatusChip
                          status={statusByUnitId[unit.id] ?? "unreviewed"}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
