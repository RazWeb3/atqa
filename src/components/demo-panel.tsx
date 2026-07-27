"use client";

import { useCallback, useState } from "react";
import type { NormalizedContent } from "@/features/content/types";

const DEMO_SAMPLE_URL = "/demo/atqa-demo-sample.json";

type DemoPanelProps = {
  onImport: (content: NormalizedContent) => void;
};

export function DemoPanel({ onImport }: DemoPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLoadDemo = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const sampleResponse = await fetch(DEMO_SAMPLE_URL);
      if (!sampleResponse.ok) {
        setError("デモ用サンプルの取得に失敗しました");
        return;
      }
      const json = await sampleResponse.json();

      const response = await fetch("/api/content/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });

      const result = await response.json();

      if (!response.ok) {
        setError("デモ用サンプルの読み込みに失敗しました");
        return;
      }

      onImport(result);
    } catch {
      setError("デモ用サンプルの読み込みに失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [onImport]);

  return (
    <section className="demo-panel" aria-labelledby="demo-heading">
      <h2 id="demo-heading">デモ用サンプルで試す</h2>
      <p className="demo-description">
        ATQA自身を紹介する5ユニットのサンプルです。誤読を仕込んだ音声と正しい音声を交互に配置しています。AIは音声認識と生成AIの二重チェックで判定するため、確信が持てない箇所は正常と偽らず「要確認」や「判定不能」として人の判断に委ねます。
      </p>

      <ul className="demo-unit-list">
        <li>
          <span className="demo-tag demo-tag-pass">正しい音声</span>
          ATQAの紹介 — 補正済みの原稿を合成
        </li>
        <li>
          <span className="demo-tag demo-tag-review">誤読入り</span>
          漢字の誤読 — 一段落・担いますの誤読を仕込んだ音声
        </li>
        <li>
          <span className="demo-tag demo-tag-pass">正しい音声</span>
          二段階検査の仕組み — 補正済みの原稿を合成
        </li>
        <li>
          <span className="demo-tag demo-tag-review">誤読入り</span>
          ファイル名 — .gitignoreを辞書なしでAIが判定
        </li>
        <li>
          <span className="demo-tag demo-tag-pass">正しい音声</span>
          まとめ — 補正済みの原稿を合成
        </li>
      </ul>

      <div className="demo-actions">
        <button
          type="button"
          onClick={handleLoadDemo}
          disabled={isLoading}
          className="btn btn-secondary"
        >
          {isLoading ? "読み込み中..." : "デモ用サンプルを読み込む"}
        </button>
      </div>

      {error && (
        <p className="demo-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
