export type PlaybackStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "error"
  | "completed";

export type PlaybackState = {
  status: PlaybackStatus;
  unitIndex: number;
  currentTimeSec: number;
  durationSec: number | null;
  continuous: boolean;
  errorCode?: string;
};

export type PlaybackEvent =
  | { type: "LOAD"; index: number }
  | { type: "LOADED"; durationSec: number }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TIME"; currentTimeSec: number }
  | { type: "ENDED"; unitCount: number }
  | { type: "AUDIO_ERROR"; message: string }
  | { type: "PREVIOUS"; unitCount: number }
  | { type: "NEXT"; unitCount: number }
  | { type: "SELECT_UNIT"; index: number }
  | { type: "SET_CONTINUOUS"; enabled: boolean };

export const initialPlaybackState: PlaybackState = {
  status: "idle",
  unitIndex: 0,
  currentTimeSec: 0,
  durationSec: null,
  continuous: true,
};

export function playbackReducer(
  state: PlaybackState,
  event: PlaybackEvent,
): PlaybackState {
  switch (event.type) {
    case "LOAD":
      return {
        ...state,
        status: "loading",
        unitIndex: event.index,
        currentTimeSec: 0,
        durationSec: null,
        errorCode: undefined,
      };

    case "LOADED":
      if (state.status !== "loading") return state;
      return {
        ...state,
        status: "paused",
        durationSec: event.durationSec,
      };

    case "PLAY":
      if (state.status === "error" || state.status === "completed") {
        return state;
      }
      return {
        ...state,
        status: "playing",
      };

    case "PAUSE":
      if (state.status !== "playing") return state;
      return {
        ...state,
        status: "paused",
      };

    case "TIME":
      return {
        ...state,
        currentTimeSec: event.currentTimeSec,
      };

    case "ENDED": {
      const isLastUnit = state.unitIndex >= event.unitCount - 1;

      if (isLastUnit) {
        return {
          ...state,
          status: "completed",
          currentTimeSec: 0,
        };
      }

      if (state.continuous) {
        return {
          ...state,
          status: "loading",
          unitIndex: state.unitIndex + 1,
          currentTimeSec: 0,
          durationSec: null,
        };
      }

      return {
        ...state,
        status: "paused",
        currentTimeSec: 0,
      };
    }

    case "AUDIO_ERROR":
      return {
        ...state,
        status: "error",
        errorCode: event.message,
      };

    case "PREVIOUS": {
      if (state.unitIndex <= 0) return state;
      return {
        ...state,
        status: "loading",
        unitIndex: state.unitIndex - 1,
        currentTimeSec: 0,
        durationSec: null,
        errorCode: undefined,
      };
    }

    case "NEXT": {
      if (state.unitIndex >= event.unitCount - 1) return state;
      return {
        ...state,
        status: "loading",
        unitIndex: state.unitIndex + 1,
        currentTimeSec: 0,
        durationSec: null,
        errorCode: undefined,
      };
    }

    case "SELECT_UNIT":
      return {
        ...state,
        status: "loading",
        unitIndex: event.index,
        currentTimeSec: 0,
        durationSec: null,
        errorCode: undefined,
      };

    case "SET_CONTINUOUS":
      return {
        ...state,
        continuous: event.enabled,
      };

    default:
      return state;
  }
}
