import { EventEmitter } from "node:events";
import type { Snapshot } from "./types";

export interface VoteBus extends EventEmitter {
  on(
    event: "votes-changed",
    listener: (pollId: string, snapshot: Snapshot) => void
  ): this;
  emit(event: "votes-changed", pollId: string, snapshot: Snapshot): boolean;
}

const g = globalThis as unknown as { __voteBus?: VoteBus };

export function getBus(): VoteBus {
  g.__voteBus ??= new EventEmitter() as VoteBus;
  g.__voteBus.setMaxListeners(50);
  return g.__voteBus;
}
