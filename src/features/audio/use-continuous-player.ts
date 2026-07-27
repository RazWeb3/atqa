"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { PlaybackUnit } from "@/features/content/types";
import {
  initialPlaybackState,
  playbackReducer,
  type PlaybackState,
} from "./playback-reducer";

export type ContinuousPlayer = {
  state: PlaybackState;
  play: () => Promise<void>;
  pause: () => void;
  previous: () => void;
  next: () => void;
  select: (index: number) => void;
  seekAndPlay: (seconds: number) => void;
  setContinuous: (enabled: boolean) => void;
};

export function useContinuousPlayer(
  units: PlaybackUnit[],
): ContinuousPlayer {
  const [state, dispatch] = useReducer(playbackReducer, initialPlaybackState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Set when a unit ends during continuous playback so the next unit
  // starts automatically once its audio is loaded.
  const autoplayNextRef = useRef(false);
  const continuousRef = useRef(initialPlaybackState.continuous);
  continuousRef.current = state.continuous;

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      dispatch({ type: "LOADED", durationSec: audio.duration });
    };

    const handleTimeUpdate = () => {
      dispatch({ type: "TIME", currentTimeSec: audio.currentTime });
    };

    const handleEnded = () => {
      autoplayNextRef.current = continuousRef.current;
      dispatch({ type: "ENDED", unitCount: units.length });
    };

    const handleError = () => {
      dispatch({
        type: "AUDIO_ERROR",
        message: "音声の読み込みに失敗しました",
      });
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.pause();
      audio.src = "";
    };
  }, [units.length]);

  // Load audio when unit changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || units.length === 0) return;

    if (state.status === "loading") {
      const unit = units[state.unitIndex];
      if (unit) {
        // Use the API proxy for audio
        const proxyUrl = `/api/audio?url=${encodeURIComponent(unit.audioUrl)}`;
        audio.src = proxyUrl;
        audio.load();

        if (autoplayNextRef.current) {
          autoplayNextRef.current = false;
          const handleCanPlay = () => {
            audio.removeEventListener("canplay", handleCanPlay);
            audio
              .play()
              .then(() => dispatch({ type: "PLAY" }))
              .catch(() =>
                dispatch({
                  type: "AUDIO_ERROR",
                  message: "再生を開始できませんでした",
                }),
              );
          };
          audio.addEventListener("canplay", handleCanPlay);
        }
      }
    }
  }, [state.status, state.unitIndex, units]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.status === "idle" && units.length > 0) {
      dispatch({ type: "LOAD", index: 0 });
      // Wait for load to complete
      await new Promise<void>((resolve) => {
        const checkLoaded = () => {
          if (audio.readyState >= 2) {
            resolve();
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
      });
    }

    try {
      await audio.play();
      dispatch({ type: "PLAY" });
    } catch {
      dispatch({
        type: "AUDIO_ERROR",
        message: "再生を開始できませんでした",
      });
    }
  }, [state.status, units.length]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    dispatch({ type: "PAUSE" });
  }, []);

  const previous = useCallback(() => {
    autoplayNextRef.current = false;
    dispatch({ type: "PREVIOUS", unitCount: units.length });
  }, [units.length]);

  const next = useCallback(() => {
    autoplayNextRef.current = false;
    dispatch({ type: "NEXT", unitCount: units.length });
  }, [units.length]);

  const select = useCallback((index: number) => {
    autoplayNextRef.current = false;
    dispatch({ type: "SELECT_UNIT", index });
  }, []);

  // Seek and play as a single operation so "問題位置から再生" always
  // produces audible playback, even before the unit's audio is loaded.
  const seekAndPlay = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      const applySeekAndPlay = () => {
        audio.currentTime = seconds;
        dispatch({ type: "TIME", currentTimeSec: seconds });
        audio
          .play()
          .then(() => dispatch({ type: "PLAY" }))
          .catch(() =>
            dispatch({
              type: "AUDIO_ERROR",
              message: "再生を開始できませんでした",
            }),
          );
      };

      const waitThenApply = () => {
        const handleCanPlay = () => {
          audio.removeEventListener("canplay", handleCanPlay);
          applySeekAndPlay();
        };
        audio.addEventListener("canplay", handleCanPlay);
      };

      if (state.status === "idle" || state.status === "completed") {
        // Audio for the current unit has not been loaded yet; trigger the
        // load effect and seek once the audio is playable.
        autoplayNextRef.current = false;
        dispatch({ type: "LOAD", index: state.unitIndex });
        waitThenApply();
        return;
      }

      if (audio.readyState < 2) {
        waitThenApply();
        return;
      }

      applySeekAndPlay();
    },
    [state.status, state.unitIndex],
  );

  const setContinuous = useCallback((enabled: boolean) => {
    dispatch({ type: "SET_CONTINUOUS", enabled });
  }, []);

  return {
    state,
    play,
    pause,
    previous,
    next,
    select,
    seekAndPlay,
    setContinuous,
  };
}
