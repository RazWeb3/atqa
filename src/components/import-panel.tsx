"use client";

import { useCallback, useRef, useState } from "react";
import type { NormalizedContent } from "@/features/content/types";

type ImportPanelProps = {
  onImport: (content: NormalizedContent) => void;
};

type ImportError = {
  path: string;
  message: string;
};

export function ImportPanel({ onImport }: ImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsLoading(true);
      setErrors([]);

      try {
        const text = await file.text();
        const json = JSON.parse(text);

        const response = await fetch("/api/content/normalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(json),
        });

        const result = await response.json();

        if (!response.ok) {
          setErrors(result.issues || [{ path: "", message: "読み込みに失敗しました" }]);
          return;
        }

        onImport(result);
      } catch (error) {
        setErrors([
          {
            path: "",
            message:
              error instanceof SyntaxError
                ? "JSONの形式が正しくありません"
                : "ファイルの読み込みに失敗しました",
          },
        ]);
      } finally {
        setIsLoading(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [onImport],
  );

  return (
    <section className="import-panel" aria-labelledby="import-heading">
      <h2 id="import-heading">コンテンツの読み込み</h2>
      <p className="import-description">
        Sokqa形式のJSONファイル（document / quiz）を選択してください。
      </p>

      <div className="import-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileSelect}
          disabled={isLoading}
          aria-label="JSONファイルを選択"
          className="file-input"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="btn btn-primary"
        >
          {isLoading ? "読み込み中..." : "JSONファイルを選択"}
        </button>
      </div>

      {errors.length > 0 && (
        <div className="import-errors" role="alert">
          <h3>読み込みエラー</h3>
          <ul>
            {errors.map((error, index) => (
              <li key={index}>
                {error.path && <code>{error.path}</code>}
                {error.path && ": "}
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
