"use client";

import { create } from "zustand";

export type ReplayMode = "live" | "replay";

export type PlaybackRate = 0.5 | 1 | 2 | 4;

type ReplayStore = {
  mode: ReplayMode;
  replayT: number;
  replayMax: number;
  isPlaying: boolean;
  playbackRate: PlaybackRate;
  setMode: (mode: ReplayMode) => void;
  setReplayT: (time: number) => void;
  setReplayMax: (max: number) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackRate: (rate: PlaybackRate) => void;
  stepReplay: (delta: number) => void;
  jumpTo: (time: number) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

export const useReplayStore = create<ReplayStore>((set) => ({
  mode: "live",
  replayT: 0,
  replayMax: 0,
  isPlaying: false,
  playbackRate: 1,
  setMode: (mode) =>
    set((state) => ({
      mode,
      isPlaying: mode === "replay" ? state.isPlaying : false,
    })),
  setReplayT: (time) =>
    set((state) => ({
      replayT: clamp(Math.floor(time), 0, state.replayMax),
    })),
  setReplayMax: (max) =>
    set((state) => {
      const nextMax = Math.max(0, Math.floor(max));
      return {
        replayMax: nextMax,
        replayT: clamp(state.replayT, 0, nextMax),
      };
    }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  stepReplay: (delta) =>
    set((state) => ({
      replayT: clamp(state.replayT + Math.floor(delta), 0, state.replayMax),
    })),
  jumpTo: (time) =>
    set((state) => ({
      replayT: clamp(Math.floor(time), 0, state.replayMax),
    })),
}));
