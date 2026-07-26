"use client";

import type { PlaybackUnit } from "@/features/content/types";

type SectionNavProps = {
  units: PlaybackUnit[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export function SectionNav({
  units,
  selectedIndex,
  onSelect,
}: SectionNavProps) {
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

  return (
    <nav className="section-nav" aria-label="セクションナビゲーション">
      <h3>セクション一覧</h3>
      <ul className="nav-list">
        {groupIds.map((groupId) => {
          const groupUnits = groups[groupId];
          const firstUnit = groupUnits[0];
          const isGroupSelected = groupUnits.some(
            (u) => u.order === selectedIndex,
          );

          return (
            <li key={groupId} className="nav-group">
              <button
                type="button"
                className={`nav-group-header ${isGroupSelected ? "selected" : ""}`}
                onClick={() => onSelect(firstUnit.order)}
                aria-current={isGroupSelected ? "true" : undefined}
              >
                {groupId}
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
