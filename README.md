# ATQA

Autonomous TTS Quality Assurance Agent（ATQA）は、既存のクラウド音声と読み上げ原稿をAIで検査し、人が全文を試聴する作業を「要確認箇所だけを聞く作業」へ変えるWebプロトタイプです。

## 現在の状態

設計承認済み、実装前です。

- [MVP設計仕様書](docs/superpowers/specs/2026-07-27-atqa-mvp-design.md)
- 対象イベント：AI Native UX 2026 — AI Designathon @ MERGE 2026
- 実装期間：3日
- 対応入力：Sokqa形式の `document` / `quiz` JSON

## プロダクトの約束

ATQAは音声品質の完全自動保証を主張しません。Cloud Speech-to-Text、決定的な読み比較、Geminiによる音声レビューを組み合わせ、誤読の可能性がある場所を根拠と再生位置付きで絞り込みます。

