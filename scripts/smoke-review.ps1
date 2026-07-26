$unit = @{
  id = "doc-1"
  groupId = "doc-1"
  kind = "document"
  order = 0
  displayText = "ITパスポートの学習では、ITプロジェクトの全体像と、それを効果的に管理するマネジメントの基礎知識が不可欠です。"
  synthesisText = "アイティーパスポートの学習では、エーアイティープロジェクトの全体像と、それを効果的に管理するマネジメントの基礎知識が不可欠です。"
  expectedReading = $null
  audioUrl = "https://cdn.convly.jp/sokqa/creators/sokqa_official/packs/cnt_938dda303d/objects/audio/av_20260721_225017_cnt_938dda303d_doc_01__doc_doc-1_020e6f59.mp3"
  sourcePath = "documents[0]"
}
$body = @{ unit = $unit } | ConvertTo-Json -Depth 5
try {
  $r = Invoke-WebRequest -Uri "http://localhost:3000/api/reviews" -Method Post `
    -ContentType "application/json; charset=utf-8" `
    -Headers @{ "Idempotency-Key" = [guid]::NewGuid().ToString() } `
    -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
  "STATUS: $($r.StatusCode)"
  $r.Content
} catch {
  "FAILED: $($_.Exception.Message)"
  if ($_.ErrorDetails.Message) { "BODY: $($_.ErrorDetails.Message)" }
}
