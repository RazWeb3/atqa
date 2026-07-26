"use client";

import type { PlaybackState } from "@/features/audio/playback-reducer";

type TransportControlsProps = {
  state: PlaybackState;
  unitCount: number;
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleContinuous: () => void;
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function TransportControls({
  state,
  unitCount,
  onPlay,
  onPause,
  onPrevious,
  onNext,
  onToggleContinuous,
}: TransportControlsProps) {
  const isPlaying = state.status === "playing";
  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  const isCompleted = state.status === "completed";

  return (
    <div className="transport-controls">
      <div className="transport-status" aria-live="polite">
        {isLoading && <span>読み込み中...</span>}
        {isError && (
          <span className="error-text" role="alert">
            エラー: {state.errorCode}
          </span>
        )}
        {isCompleted && <span>再生完了</span>}
        {!isLoading && !isError && !isCompleted && (
          <span>
            {formatTime(state.currentTimeSec)}
            {state.durationSec !== null &&
              ` / ${formatTime(state.durationSec)}`}
          </span>
        )}
      </div>

      <div className="transport-buttons">
        <button
          type="button"
          onClick={onPrevious}
          disabled={state.unitIndex <= 0 || isLoading}
          aria-label="前のユニット"
          className="btn btn-secondary"
        >
          前へ
        </button>

        {isPlaying ? (
          <button
            type="button"
            onClick={onPause}
            aria-label="一時停止"
            className="btn btn-primary"
          >
            一時停止
          </button>
        ) : (
          <button
            type="button"
            onClick={onPlay}
            disabled={isLoading || isCompleted}
            aria-label="再生"
            className="btn btn-primary"
          >
            再生
          </button>
        )}

        <button
          type="button"
          onClick={onNext}
          disabled={state.unitIndex >= unitCount - 1 || isLoading}
          aria-label="次のユニット"
          className="btn btn-secondary"
        >
          次へ
        </button>
      </div>

      <div className="transport-options">
        <button
          type="button"
          onClick={onToggleContinuous}
          aria-pressed={state.continuous}
          className={`btn btn-toggle ${state.continuous ? "active" : ""}`}
        >
          連続再生: {state.continuous ? "オン" : "オフ"}
        </button>
        <span className="unit-indicator">
          {state.unitIndex + 1} / {unitCount}
        </span>
      </div>
    </div>
  );
}
