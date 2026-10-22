import {
  CANNON_RESOLVE_MS,
  COUNTDOWN_MS,
  POWER_RESOLVE_MS,
  STEP_MS,
} from "../../../shared/constants.ts";
import { FIXTURE_NOW, fixtures, type FixtureName } from "../../../shared/fixtures/index.ts";
import { makeTurnId } from "../../../shared/protocol.ts";
import type { RoomState, Seat } from "../../../shared/types.ts";
import type { ConnectionFactory } from "../connection.ts";

export interface MockOptions {
  mode: string;
  seat: Seat;
}
interface TapeFrame {
  fixture: FixtureName;
  round?: number;
}
// Recorded fixtures, not a rules engine: outcomes and HP are copied verbatim.
const DEMO_TAPE: TapeFrame[] = [
  { fixture: "countdown" },
  { fixture: "playingCannonStep", round: 1 },
  { fixture: "resolvingCannon", round: 1 },
  { fixture: "playingAfterTurnSkipped", round: 2 },
  { fixture: "playingPowerStep", round: 3 },
  { fixture: "resolvingPower", round: 3 },
  { fixture: "playingWithStatuses", round: 3 },
  { fixture: "resolvingCannon", round: 3 },
  { fixture: "playingCannonStep", round: 4 },
  { fixture: "resolvingCannon", round: 4 },
  { fixture: "playingAfterTurnSkipped", round: 5 },
  { fixture: "playingPowerStep", round: 6 },
  { fixture: "resolvingPowerAuto", round: 6 },
  { fixture: "playingOpponentDisconnected", round: 6 },
  { fixture: "resolvingCannon", round: 6 },
  { fixture: "playingCannonStep", round: 7 },
  { fixture: "resolvingCannon", round: 7 },
  { fixture: "playingCannonStep", round: 8 },
  { fixture: "resolvingCannon", round: 8 },
  { fixture: "finishedRoundsWin" },
];

export function createMockFactory({ mode, seat }: MockOptions): ConnectionFactory {
  return (options) => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let version = 0;
    let eventId = 0;
    let frame = 0;
    let matchNumber = 1;
    let lastEvent: RoomState["lastEvent"] = null;
    let current: RoomState;
    const demo = mode === "demo";
    const schedule = (callback: () => void, delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!closed) callback();
      }, delay);
    };
    const emit = (source: RoomState, round?: number) => {
      current = structuredClone(source);
      current.code = options.code;
      current.version = ++version;
      current.serverNow = Date.now();
      if (current.countdownEndsAt !== null)
        current.countdownEndsAt =
          current.serverNow + (demo ? COUNTDOWN_MS : current.countdownEndsAt - FIXTURE_NOW);
      if (current.match) {
        const match = current.match;
        match.number = matchNumber;
        if (round !== undefined) match.round = round;
        if (demo) {
          match.firstSeat = matchNumber % 2 === 1 ? 1 : 2;
          if (matchNumber % 2 === 0) {
            match.currentSeat = match.currentSeat === 1 ? 2 : 1;
            match.towers = { 1: match.towers[2], 2: match.towers[1] };
            if (current.result && current.result.winner !== "tie")
              current.result.winner = current.result.winner === 1 ? 2 : 1;
            if (current.lastEvent) {
              current.lastEvent.actor = current.lastEvent.actor === 1 ? 2 : 1;
              if (current.lastEvent.type === "cannon")
                current.lastEvent.target = current.lastEvent.target === 1 ? 2 : 1;
            }
          }
        }
        match.turnId = makeTurnId(match.number, match.round, match.currentSeat, match.step);
        match.turnDeadline =
          current.serverNow + (demo ? STEP_MS : source.match!.turnDeadline - FIXTURE_NOW);
      }
      if (demo) {
        // Only resolving/skip frames introduce events. Actionable frames keep the last event.
        if (
          current.lastEvent &&
          (current.match?.step === "resolving" || current.lastEvent.type === "turnSkipped")
        )
          lastEvent = { ...current.lastEvent, eventId: ++eventId };
        current.lastEvent = lastEvent;
      }
      options.onMessage({ type: "state", state: structuredClone(current) });
    };
    const advance = () => {
      if (frame >= DEMO_TAPE.length) return;
      const next = DEMO_TAPE[frame++]!;
      emit(fixtures[next.fixture], next.round);
      if (current.phase === "finished") return;
      const delay =
        current.phase === "countdown"
          ? COUNTDOWN_MS
          : current.match?.step === "resolving"
            ? current.lastEvent?.type === "power"
              ? POWER_RESOLVE_MS
              : CANNON_RESOLVE_MS
            : 2_200;
      schedule(advance, delay);
    };
    schedule(() => {
      options.onMessage({ type: "welcome", seat, code: options.code });
      if (demo) {
        emit(fixtures.lobbyOpponentDisconnected);
        // The recorded demo starts automatically as well as responding to Ready.
        schedule(advance, 1_200);
      } else if (Object.hasOwn(fixtures, mode)) emit(fixtures[mode as FixtureName]);
      else options.onMessage({ type: "error", code: "ROOM_NOT_FOUND", message: "Unknown fixture" });
    }, 0);
    return {
      close() {
        closed = true;
        clearTimeout(timer);
      },
      send(intent) {
        if (closed) return;
        if (intent.type === "leave") {
          closed = true;
          clearTimeout(timer);
          return;
        }
        if (!demo) {
          // Static fixtures remain static; explicit rejection releases the click latch.
          options.onMessage({
            type: "error",
            code: "INVALID_PHASE",
            message: "Static fixture: use mock=demo for interactions",
          });
          return;
        }
        if (intent.type === "rematch" && current.phase === "finished") {
          const voted = structuredClone(current);
          voted.rematchVotes = [seat];
          voted.version = ++version;
          voted.serverNow = Date.now();
          current = voted;
          options.onMessage({ type: "state", state: structuredClone(voted) });
          schedule(() => {
            matchNumber++;
            frame = 0;
            advance();
          }, 1_200);
          return;
        }
        if (intent.type === "ready" && current.phase === "lobby") {
          advance();
          return;
        }
        const expected = intent.type === "rollPower" ? "power" : "cannon";
        if (
          (intent.type === "rollPower" || intent.type === "rollCannon") &&
          current.phase === "playing" &&
          current.match?.step === expected &&
          current.match.currentSeat === seat &&
          current.match.turnId === intent.turnId
        ) {
          advance();
          return;
        }
        options.onMessage({
          type: "error",
          code: "INVALID_PHASE",
          message: "Not the current scripted action",
        });
      },
    };
  };
}
