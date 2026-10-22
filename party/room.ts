import {
  CANNON_RESOLVE_MS,
  COUNTDOWN_MS,
  POWER_RESOLVE_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SEATS,
  STEP_MS,
} from "../shared/constants.ts";
import {
  opponent,
  parseClientMessage,
  parseConnectParams,
  sanitizeName,
} from "../shared/protocol.ts";
import { cryptoRandom, randomTowerSeed } from "../shared/rng.ts";
import {
  advanceTurn,
  applyCannon,
  applyPower,
  checkResult,
  skipTurn,
  startMatch,
} from "../shared/rules.ts";
import type { CompletedStep, RuleResult } from "../shared/rules.ts";
import type {
  ErrorCode,
  GameEvent,
  GameEventBody,
  MatchResult,
  MatchState,
  Phase,
  PlayerInfo,
  Rng,
  RoomState,
  Seat,
  ServerMessage,
} from "../shared/types.ts";

export interface Transport {
  send(connectionId: string, message: ServerMessage): void;
  close(connectionId: string, code: number, reason: string): void;
}

export interface Clock {
  now(): number;
}

/** The scheduler owns opaque timer handles; the controller never assumes Node or Workers types. */
export interface Scheduler {
  set(ms: number, callback: () => void): unknown;
  clear(handle: unknown): void;
}

export interface RoomDependencies {
  transport: Transport;
  clock: Clock;
  scheduler: Scheduler;
  rng: Rng;
  /** Cosmetic randomness is separate from the frozen gameplay Rng contract. */
  towerSeed?: () => number;
}

interface Binding {
  playerId: string;
  seat: Seat;
}

/** One in-memory room, independent of PartyKit and its runtime. */
export class RoomController {
  private readonly bindings = new Map<string, Binding>();
  private readonly owners: Partial<
    Record<Seat, { playerId: string; connectionId: string | null }>
  > = {};
  private players: Partial<Record<Seat, PlayerInfo>> = {};
  private phase: Phase = "lobby";
  private hostSeat: Seat = 1;
  private match: MatchState | null = null;
  private countdownEndsAt: number | null = null;
  private lastEvent: GameEvent | null = null;
  private result: MatchResult | null = null;
  private rematchVotes: Seat[] = [];
  private version = 0;
  private eventId = 0;
  private timer: unknown = null;
  private timerGeneration = 0;

  constructor(
    private readonly code: string,
    private readonly dependencies: RoomDependencies,
  ) {}

  onConnect(connectionId: string, input: string | URL): void {
    let url: URL;
    try {
      url = input instanceof URL ? input : new URL(input);
    } catch {
      this.reject(connectionId, "INVALID_MESSAGE", true);
      return;
    }
    const params = parseConnectParams(url);
    if (
      params === null ||
      this.code.length !== ROOM_CODE_LENGTH ||
      ![...this.code].every((character) => ROOM_CODE_ALPHABET.includes(character))
    ) {
      this.reject(connectionId, "INVALID_MESSAGE", true);
      return;
    }

    const knownSeat = SEATS.find((seat) => this.owners[seat]?.playerId === params.playerId);
    if (knownSeat !== undefined) {
      const owner = this.owners[knownSeat]!;
      const previousId = owner.connectionId;
      // Remove the old binding before closing: its close callback cannot disconnect the new tab.
      if (previousId !== null && previousId !== connectionId) {
        this.bindings.delete(previousId);
        this.reject(previousId, "REPLACED_BY_NEW_TAB", true);
      }
      owner.connectionId = connectionId;
      this.bindings.set(connectionId, { playerId: params.playerId, seat: knownSeat });
      this.players[knownSeat]!.connected = true;
      this.welcome(connectionId, knownSeat);
      this.publish();
      return;
    }

    const occupied = SEATS.filter((seat) => this.players[seat] !== undefined);
    if (params.intent === "create" && occupied.length > 0) {
      this.reject(connectionId, "CODE_TAKEN", true);
      return;
    }
    if (params.intent === "join" && occupied.length === 0) {
      this.reject(connectionId, "ROOM_NOT_FOUND", true);
      return;
    }
    if (this.phase !== "lobby") {
      this.reject(connectionId, "GAME_IN_PROGRESS", true);
      return;
    }
    const seat = SEATS.find((candidate) => this.players[candidate] === undefined);
    if (seat === undefined) {
      this.reject(connectionId, "ROOM_FULL", true);
      return;
    }
    if (occupied.length === 0) this.hostSeat = seat;
    this.owners[seat] = { playerId: params.playerId, connectionId };
    this.players[seat] = { name: sanitizeName(params.name, seat), connected: true, ready: false };
    this.bindings.set(connectionId, { playerId: params.playerId, seat });
    this.welcome(connectionId, seat);
    this.publish();
  }

  onMessage(connectionId: string, raw: unknown): void {
    const binding = this.bindings.get(connectionId);
    if (binding === undefined || this.owners[binding.seat]?.connectionId !== connectionId) return;
    const message = parseClientMessage(raw);
    if (message === null) {
      this.reject(connectionId, "INVALID_MESSAGE");
      return;
    }
    const seat = binding.seat;
    switch (message.type) {
      case "leave":
        this.leave(connectionId, seat);
        return;
      case "ready":
        if (this.phase !== "lobby" || !this.bothPresent()) {
          this.reject(connectionId, "INVALID_PHASE");
          return;
        }
        if (this.players[seat]!.ready) return;
        this.players[seat]!.ready = true;
        if (SEATS.every((candidate) => this.players[candidate]!.ready)) this.startCountdown();
        else this.publish();
        return;
      case "rematch":
        if (this.phase !== "finished" || !this.bothPresent()) {
          this.reject(connectionId, "INVALID_PHASE");
          return;
        }
        if (this.rematchVotes.includes(seat)) return;
        this.rematchVotes.push(seat);
        if (this.rematchVotes.length === 2) this.startCountdown();
        else this.publish();
        return;
      case "rollPower":
      case "rollCannon": {
        const match = this.match;
        // Stale tokens take priority, even after a timeout moved to another seat or resolving.
        if (match !== null && message.turnId !== match.turnId) {
          this.reject(connectionId, "STALE_ACTION");
          return;
        }
        if (this.phase !== "playing" || match === null) {
          this.reject(connectionId, "INVALID_PHASE");
          return;
        }
        if (seat !== match.currentSeat) {
          this.reject(connectionId, "NOT_YOUR_TURN");
          return;
        }
        const step = message.type === "rollPower" ? "power" : "cannon";
        if (match.step !== step) {
          this.reject(connectionId, "INVALID_PHASE");
          return;
        }
        this.resolve(step, false);
      }
    }
  }

  onClose(connectionId: string): void {
    const binding = this.bindings.get(connectionId);
    this.bindings.delete(connectionId);
    if (binding === undefined || this.owners[binding.seat]?.connectionId !== connectionId) return;
    this.owners[binding.seat]!.connectionId = null;
    this.players[binding.seat]!.connected = false;
    this.publish();
  }

  private bothPresent(): boolean {
    return SEATS.every((seat) => this.players[seat] !== undefined);
  }

  private welcome(connectionId: string, seat: Seat): void {
    this.dependencies.transport.send(connectionId, { type: "welcome", seat, code: this.code });
  }

  private reject(connectionId: string, code: ErrorCode, fatal = false): void {
    this.dependencies.transport.send(connectionId, { type: "error", code, message: code });
    if (fatal) this.dependencies.transport.close(connectionId, 4000, code);
  }

  /** This is the only snapshot builder: it reads public player data, never identities. */
  private toRoomState(): RoomState {
    return {
      code: this.code,
      phase: this.phase,
      hostSeat: this.hostSeat,
      players: structuredClone(this.players),
      match: structuredClone(this.match),
      countdownEndsAt: this.countdownEndsAt,
      lastEvent: structuredClone(this.lastEvent),
      result: structuredClone(this.result),
      rematchVotes: [...this.rematchVotes],
      version: ++this.version,
      serverNow: this.dependencies.clock.now(),
    };
  }

  private publish(): void {
    const message: ServerMessage = { type: "state", state: this.toRoomState() };
    for (const connectionId of this.bindings.keys())
      this.dependencies.transport.send(connectionId, message);
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.dependencies.scheduler.clear(this.timer);
    this.timer = null;
    this.timerGeneration++;
  }

  private schedule(ms: number, callback: () => void): void {
    this.cancelTimer();
    const generation = this.timerGeneration;
    const turnId = this.match?.turnId;
    this.timer = this.dependencies.scheduler.set(ms, () => {
      // Generation also guards the two resolving windows whose frozen turnIds may be equal.
      if (generation !== this.timerGeneration || turnId !== this.match?.turnId) return;
      this.timer = null;
      callback();
    });
  }

  private startCountdown(): void {
    const number = (this.match?.number ?? 0) + 1;
    const firstSeat = this.match === null ? this.hostSeat : opponent(this.match.firstSeat);
    this.match = startMatch({
      number,
      firstSeat,
      towerSeed: this.dependencies.towerSeed?.() ?? randomTowerSeed(cryptoRandom),
    });
    this.phase = "countdown";
    this.result = null;
    this.lastEvent = null;
    this.rematchVotes = [];
    // The old lobby flags/votes are reset; both seats consented to this new countdown.
    for (const seat of SEATS) this.players[seat]!.ready = true;
    this.countdownEndsAt = this.dependencies.clock.now() + COUNTDOWN_MS;
    this.schedule(COUNTDOWN_MS, () => {
      this.phase = "playing";
      this.countdownEndsAt = null;
      this.startStep();
      this.publish();
    });
    this.publish();
  }

  private startStep(): void {
    this.match!.turnDeadline = this.dependencies.clock.now() + STEP_MS;
    this.schedule(STEP_MS, () => {
      if (this.match!.step === "power") this.resolve("power", true);
      else {
        this.acceptRule(skipTurn(this.match!));
        this.complete("cannon");
      }
    });
  }

  private acceptRule(rule: RuleResult<GameEventBody>): void {
    this.match = rule.match;
    this.lastEvent = { ...rule.event, eventId: ++this.eventId };
  }

  private resolve(step: CompletedStep, auto: boolean): void {
    this.acceptRule(
      step === "power"
        ? applyPower(this.match!, this.dependencies.rng, { auto })
        : applyCannon(this.match!, this.dependencies.rng),
    );
    const ms = step === "power" ? POWER_RESOLVE_MS : CANNON_RESOLVE_MS;
    this.match!.turnDeadline = this.dependencies.clock.now() + ms;
    this.schedule(ms, () => this.complete(step));
    this.publish();
  }

  private complete(step: CompletedStep): void {
    const result = checkResult(this.match!, step);
    if (result !== null) this.finish(result);
    else {
      this.match = advanceTurn(this.match!, step);
      this.startStep();
    }
    this.publish();
  }

  private resetReady(): void {
    for (const seat of SEATS) {
      const player = this.players[seat];
      if (player !== undefined) player.ready = false;
    }
  }

  private finish(result: MatchResult): void {
    this.cancelTimer();
    this.phase = "finished";
    this.countdownEndsAt = null;
    this.result = result;
    this.rematchVotes = [];
    this.match!.turnDeadline = 0;
    this.resetReady();
  }

  private leave(connectionId: string, seat: Seat): void {
    this.bindings.delete(connectionId);
    delete this.owners[seat];
    delete this.players[seat];
    this.resetReady();
    this.rematchVotes = [];
    const remainingSeat = SEATS.find((candidate) => this.players[candidate] !== undefined);
    if (remainingSeat === undefined) {
      this.cancelTimer();
      this.phase = "lobby";
      this.hostSeat = 1;
      this.match = null;
      this.countdownEndsAt = null;
      this.lastEvent = null;
      this.result = null;
    } else {
      this.hostSeat = remainingSeat;
      if (this.phase === "countdown") {
        this.cancelTimer();
        this.phase = "lobby";
        this.match = null;
        this.countdownEndsAt = null;
        this.lastEvent = null;
        this.result = null;
      } else if (this.phase === "playing") this.finish({ winner: remainingSeat, reason: "left" });
      this.publish();
    }
    this.dependencies.transport.close(connectionId, 1000, "leave");
  }
}
