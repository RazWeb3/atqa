import { describe, expect, it } from "vitest";
import {
  initialPlaybackState,
  playbackReducer,
  type PlaybackState,
} from "@/features/audio/playback-reducer";

describe("playbackReducer", () => {
  it("transitions from LOAD to PLAY", () => {
    let state = initialPlaybackState;
    state = playbackReducer(state, { type: "LOAD", index: 0 });
    expect(state.status).toBe("loading");
    expect(state.unitIndex).toBe(0);

    state = playbackReducer(state, { type: "LOADED", durationSec: 10 });
    expect(state.status).toBe("paused");
    expect(state.durationSec).toBe(10);

    state = playbackReducer(state, { type: "PLAY" });
    expect(state.status).toBe("playing");
  });

  it("PAUSE then PLAY without resetting currentTimeSec", () => {
    let state: PlaybackState = {
      ...initialPlaybackState,
      status: "playing",
      currentTimeSec: 5,
    };

    state = playbackReducer(state, { type: "PAUSE" });
    expect(state.status).toBe("paused");
    expect(state.currentTimeSec).toBe(5);

    state = playbackReducer(state, { type: "PLAY" });
    expect(state.status).toBe("playing");
    expect(state.currentTimeSec).toBe(5);
  });

  it("ENDED advances one index only when continuous is true", () => {
    let state: PlaybackState = {
      ...initialPlaybackState,
      status: "playing",
      unitIndex: 0,
      continuous: true,
    };

    state = playbackReducer(state, { type: "ENDED", unitCount: 5 });
    expect(state.status).toBe("loading");
    expect(state.unitIndex).toBe(1);
  });

  it("ENDED does not advance when continuous is false", () => {
    let state: PlaybackState = {
      ...initialPlaybackState,
      status: "playing",
      unitIndex: 0,
      continuous: false,
    };

    state = playbackReducer(state, { type: "ENDED", unitCount: 5 });
    expect(state.status).toBe("paused");
    expect(state.unitIndex).toBe(0);
  });

  it("final ENDED becomes completed", () => {
    let state: PlaybackState = {
      ...initialPlaybackState,
      status: "playing",
      unitIndex: 4,
      continuous: true,
    };

    state = playbackReducer(state, { type: "ENDED", unitCount: 5 });
    expect(state.status).toBe("completed");
  });

  it("AUDIO_ERROR stops at the current unit", () => {
    let state: PlaybackState = {
      ...initialPlaybackState,
      status: "playing",
      unitIndex: 2,
    };

    state = playbackReducer(state, {
      type: "AUDIO_ERROR",
      message: "Network error",
    });
    expect(state.status).toBe("error");
    expect(state.unitIndex).toBe(2);
    expect(state.errorCode).toBe("Network error");
  });

  it("manual NEXT after error advances", () => {
    let state: PlaybackState = {
      ...initialPlaybackState,
      status: "error",
      unitIndex: 2,
      errorCode: "Network error",
    };

    state = playbackReducer(state, { type: "NEXT", unitCount: 5 });
    expect(state.status).toBe("loading");
    expect(state.unitIndex).toBe(3);
    expect(state.errorCode).toBeUndefined();
  });

  it("SELECT_UNIT disables stale loading state", () => {
    let state: PlaybackState = {
      ...initialPlaybackState,
      status: "playing",
      unitIndex: 0,
      currentTimeSec: 5,
    };

    state = playbackReducer(state, { type: "SELECT_UNIT", index: 3 });
    expect(state.status).toBe("loading");
    expect(state.unitIndex).toBe(3);
    expect(state.currentTimeSec).toBe(0);
    expect(state.durationSec).toBeNull();
  });

  it("PREVIOUS at first unit does nothing", () => {
    let state: PlaybackState = {
      ...initialPlaybackState,
      status: "playing",
      unitIndex: 0,
    };

    state = playbackReducer(state, { type: "PREVIOUS", unitCount: 5 });
    expect(state.unitIndex).toBe(0);
  });

  it("NEXT at last unit does nothing", () => {
    let state: PlaybackState = {
      ...initialPlaybackState,
      status: "playing",
      unitIndex: 4,
    };

    state = playbackReducer(state, { type: "NEXT", unitCount: 5 });
    expect(state.unitIndex).toBe(4);
  });

  it("SET_CONTINUOUS updates continuous flag", () => {
    let state = initialPlaybackState;
    expect(state.continuous).toBe(true);

    state = playbackReducer(state, { type: "SET_CONTINUOUS", enabled: false });
    expect(state.continuous).toBe(false);

    state = playbackReducer(state, { type: "SET_CONTINUOUS", enabled: true });
    expect(state.continuous).toBe(true);
  });

  it("PLAY does nothing in error state", () => {
    let state: PlaybackState = {
      ...initialPlaybackState,
      status: "error",
      errorCode: "test",
    };

    state = playbackReducer(state, { type: "PLAY" });
    expect(state.status).toBe("error");
  });

  it("PLAY does nothing in completed state", () => {
    let state: PlaybackState = {
      ...initialPlaybackState,
      status: "completed",
    };

    state = playbackReducer(state, { type: "PLAY" });
    expect(state.status).toBe("completed");
  });
});
