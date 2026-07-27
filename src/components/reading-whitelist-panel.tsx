"use client";

import { useState } from "react";
import type { WhitelistEntry } from "@/features/review/reading-whitelist";

type ReadingWhitelistPanelProps = {
  entries: WhitelistEntry[];
  onAdd: (token: string, reading: string) => void;
  onRemove: (token: string) => void;
};

/**
 * Management view for human-approved readings. Approvals normally happen
 * with one click from the review panel; this panel is for auditing the
 * accumulated list and for manual additions/removals.
 */
export function ReadingWhitelistPanel({
  entries,
  onAdd,
  onRemove,
}: ReadingWhitelistPanelProps) {
  const [token, setToken] = useState("");
  const [reading, setReading] = useState("");

  const canAdd = token.trim().length > 0 && reading.trim().length > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd(token.trim(), reading.trim());
    setToken("");
    setReading("");
  };

  return (
    <details className="whitelist-panel" data-testid="whitelist-panel">
      <summary>承認済み読み一覧 ({entries.length}件)</summary>

      <p className="whitelist-hint">
        登録した読みは次回の検査から辞書として適用されます。
      </p>

      <div className="whitelist-add-form">
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="語 (例: Java)"
          aria-label="登録する語"
          data-testid="whitelist-token-input"
        />
        <input
          type="text"
          value={reading}
          onChange={(e) => setReading(e.target.value)}
          placeholder="読み (例: ジャバ)"
          aria-label="登録する読み"
          data-testid="whitelist-reading-input"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!canAdd}
          className="btn btn-secondary btn-small"
          data-testid="whitelist-add-manual"
        >
          追加
        </button>
      </div>

      {entries.length > 0 ? (
        <table className="whitelist-table" data-testid="whitelist-table">
          <thead>
            <tr>
              <th>語</th>
              <th>読み</th>
              <th>登録日</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.token}>
                <td>{entry.token}</td>
                <td>{entry.reading}</td>
                <td>{entry.addedAt.slice(0, 10)}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => onRemove(entry.token)}
                    className="btn btn-secondary btn-small"
                    aria-label={`「${entry.token}」を削除`}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="whitelist-empty">まだ登録がありません。</p>
      )}
    </details>
  );
}
