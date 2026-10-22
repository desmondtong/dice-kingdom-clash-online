/// <reference types="node" />

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { env } from "node:process";
import {
  CANNON_RESOLVE_MS,
  COUNTDOWN_MS,
  DIE_FACES,
  ERROR_CODES,
  MAX_HP,
  POWER_RESOLVE_MS,
  POWERS,
  RESULT_REASONS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SEATS,
  STEP_MS,
  STEPS,
} from "../../../shared/constants.ts";
import type {
  ClientMessage,
  ErrorCode,
  RoomState,
  Seat,
  ServerMessage,
} from "../../../shared/types.ts";

/**
 * Manual adapter smoke test. Start `npm run dev:server` separately, then run:
 *
 *   node tests/server/smoke/twoPlayers.ts
 *
 * This intentionally uses Node's built-in WebSocket rather than a test dependency. It talks only
 * to the local PartyKit adapter at ws://localhost:1999 and is not part of Vitest.
 */

const SERVER_ORIGIN = "ws://localhost:1999";
const PARTY_NAME = "main";
const CONNECT_TIMEOUT_MS = 10_000;
const ACTION_TIMEOUT_MS = Math.max(STEP_MS + CANNON_RESOLVE_MS + 5_000, 15_000);
const DEFAULT_IDLE_PROBES_MS = [5_000, 30_000, 65_000] as const;
const MAX_CONFIGURED_DURATION_MS = 10 * 60_000;
const MIN_OVERALL_TIMEOUT_MS = 180_000;

interface SmokeSettings {
  idleProbeMs: number[];
  overallTimeoutMs: number;
}

interface CloseRecord {
  code: number;
  reason: string;
}

interface PendingMessage {
  description: string;
  predicate: (message: ServerMessage) => boolean;
  resolve: (message: ServerMessage) => void;
}

interface PendingClose {
  resolve: (record: CloseRecord) => void;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSeat(value: unknown): value is Seat {
  return (SEATS as readonly unknown[]).includes(value);
}

function isErrorCode(value: unknown): value is ErrorCode {
  return (ERROR_CODES as readonly unknown[]).includes(value);
}

function isServerMessage(value: unknown): value is ServerMessage {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  switch (value.type) {
    case "welcome":
      return isSeat(value.seat) && typeof value.code === "string";
    case "state":
      return isRecord(value.state);
    case "error":
      return isErrorCode(value.code) && typeof value.message === "string";
    default:
      return false;
  }
}

function getPositiveDuration(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  assert(
    Number.isSafeInteger(value) && value > 0 && value <= MAX_CONFIGURED_DURATION_MS,
    `${name} must be a positive integer no greater than ${MAX_CONFIGURED_DURATION_MS} ms`,
  );
  return value;
}

function readSettings(): SmokeSettings {
  const rawProbes = env.DKC_SMOKE_IDLE_PROBES_MS;
  const idleProbeMs =
    rawProbes === undefined
      ? [...DEFAULT_IDLE_PROBES_MS]
      : rawProbes.split(",").map((part) => {
          const value = getPositiveDuration(part.trim(), "DKC_SMOKE_IDLE_PROBES_MS entry");
          assert(value !== undefined, "DKC_SMOKE_IDLE_PROBES_MS entries must not be empty");
          return value;
        });

  assert(idleProbeMs.length > 0, "DKC_SMOKE_IDLE_PROBES_MS must contain at least one duration");
  idleProbeMs.sort((left, right) => left - right);
  assert(
    idleProbeMs.every((value, index) => {
      const previous = idleProbeMs[index - 1];
      return index === 0 || (previous !== undefined && value > previous);
    }),
    "DKC_SMOKE_IDLE_PROBES_MS values must be unique and increasing",
  );
  const finalIdleProbeMs = idleProbeMs.at(-1);
  assert(finalIdleProbeMs !== undefined, "Idle probes have a final duration");

  const configuredTimeout = getPositiveDuration(env.DKC_SMOKE_TIMEOUT_MS, "DKC_SMOKE_TIMEOUT_MS");
  const overallTimeoutMs =
    configuredTimeout ?? Math.max(MIN_OVERALL_TIMEOUT_MS, finalIdleProbeMs + 90_000);
  assert(
    overallTimeoutMs > finalIdleProbeMs,
    "DKC_SMOKE_TIMEOUT_MS must be greater than the final idle probe",
  );

  return { idleProbeMs, overallTimeoutMs };
}

class Deadline {
  readonly endsAt: number;

  constructor(timeoutMs: number) {
    this.endsAt = Date.now() + timeoutMs;
  }

  remainingMs(): number {
    return this.endsAt - Date.now();
  }

  async wait<T>(promise: Promise<T>, description: string, maximumMs: number): Promise<T> {
    const timeoutMs = Math.min(maximumMs, this.remainingMs());
    assert(timeoutMs > 0, `Overall timeout elapsed while waiting for ${description}`);

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Timed out after ${timeoutMs} ms waiting for ${description}`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async sleepUntil(timestamp: number, description: string): Promise<void> {
    const waitMs = timestamp - Date.now();
    if (waitMs <= 0) return;
    await this.wait(
      new Promise<void>((resolve) => setTimeout(resolve, waitMs)),
      description,
      waitMs + 1,
    );
  }
}

function makeRoomCode(): string {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function makePlayerId(label: string): string {
  return `smoke-${label}-${randomUUID()}`;
}

function partyUrl(code: string, playerId: string, name: string, intent: "create" | "join"): string {
  assert.equal(code.length, ROOM_CODE_LENGTH, "Smoke room code has the expected length");
  assert(
    [...code].every((character) => ROOM_CODE_ALPHABET.includes(character)),
    "Smoke room code uses only the shared alphabet",
  );

  const url = new URL(`/parties/${PARTY_NAME}/${code}`, SERVER_ORIGIN);
  url.searchParams.set("playerId", playerId);
  url.searchParams.set("name", name);
  url.searchParams.set("intent", intent);

  // Keep this script local-only even if future refactoring adds configuration elsewhere.
  assert.equal(url.protocol, "ws:");
  assert.equal(url.hostname, "localhost");
  assert.equal(url.port, "1999");
  return url.toString();
}

function assertTower(tower: unknown, context: string): void {
  assert(isRecord(tower), `${context}: tower is an object`);
  const hp = tower.hp;
  assert(
    typeof hp === "number" && Number.isInteger(hp) && hp >= 0 && hp <= MAX_HP,
    `${context}: valid HP`,
  );
  assert.equal(typeof tower.shield, "boolean", `${context}: shield is boolean`);
  assert.equal(
    typeof tower.reflectNextAttack,
    "boolean",
    `${context}: reflectNextAttack is boolean`,
  );
}

function assertEvent(event: unknown, context: string): void {
  assert(isRecord(event), `${context}: event is an object`);
  const eventId = event.eventId;
  assert(
    typeof eventId === "number" && Number.isInteger(eventId) && eventId > 0,
    `${context}: eventId is positive`,
  );
  assert(isSeat(event.actor), `${context}: event actor is a seat`);

  switch (event.type) {
    case "cannon": {
      assert(
        Array.isArray(event.dice) && event.dice.length === 2,
        `${context}: cannon has two dice`,
      );
      for (const die of event.dice) {
        assert(
          Number.isInteger(die) && die >= 1 && die <= DIE_FACES,
          `${context}: cannon die is valid`,
        );
      }
      assert.equal(
        event.rawDamage,
        event.dice[0] * event.dice[1],
        `${context}: raw damage matches dice`,
      );
      assert(isSeat(event.target), `${context}: cannon target is a seat`);
      assert.equal(typeof event.reflected, "boolean", `${context}: reflected is boolean`);
      assert.equal(typeof event.shielded, "boolean", `${context}: shielded is boolean`);
      assert.equal(
        event.damage,
        event.shielded ? Math.ceil((event.rawDamage as number) / 2) : event.rawDamage,
        `${context}: applied damage follows shield rule`,
      );
      assert.equal(
        event.target === event.actor,
        event.reflected,
        `${context}: reflected target is the actor`,
      );
      return;
    }
    case "power":
      assert((POWERS as readonly unknown[]).includes(event.power), `${context}: power is valid`);
      assert.equal(typeof event.auto, "boolean", `${context}: power auto is boolean`);
      if (event.power === "heal") {
        const healAmount = event.healAmount;
        assert(
          typeof healAmount === "number" &&
            Number.isInteger(healAmount) &&
            healAmount >= 10 &&
            healAmount <= 20,
          `${context}: heal amount is valid`,
        );
      } else {
        assert.equal(event.healAmount, undefined, `${context}: non-heal has no heal amount`);
      }
      return;
    case "turnSkipped":
      return;
    default:
      assert.fail(`${context}: unknown event type ${String(event.type)}`);
  }
}

function assertRoomState(
  state: RoomState,
  code: string,
  playerIds: ReadonlySet<string>,
  context: string,
): void {
  assert.equal(state.code, code, `${context}: state remains in the expected room`);
  assert(
    ["lobby", "countdown", "playing", "finished"].includes(state.phase),
    `${context}: phase is valid`,
  );
  assert(isSeat(state.hostSeat), `${context}: host seat is valid`);
  assert(
    Number.isSafeInteger(state.version) && state.version >= 0,
    `${context}: version is non-negative`,
  );
  assert(Number.isSafeInteger(state.serverNow), `${context}: server clock is an integer`);
  assert(!Object.hasOwn(state as object, "playerId"), `${context}: state has no playerId field`);

  const serialized = JSON.stringify(state);
  assert(!serialized.includes('"playerId"'), `${context}: no nested playerId is broadcast`);
  for (const playerId of playerIds) {
    assert(!serialized.includes(playerId), `${context}: playerId is not leaked in state`);
  }

  for (const [seat, player] of Object.entries(state.players)) {
    assert(isSeat(Number(seat)), `${context}: player map has only valid seats`);
    assert(player !== undefined, `${context}: player entry is defined`);
    assert.equal(typeof player.name, "string", `${context}: player name is a string`);
    assert.equal(
      typeof player.connected,
      "boolean",
      `${context}: player connection status is boolean`,
    );
    assert.equal(typeof player.ready, "boolean", `${context}: player readiness is boolean`);
  }

  if (state.match === null) {
    assert.equal(state.phase, "lobby", `${context}: only a lobby has no match`);
  } else {
    const { match } = state;
    assert(
      Number.isInteger(match.number) && match.number >= 1,
      `${context}: match number is valid`,
    );
    assert(isSeat(match.firstSeat), `${context}: first seat is valid`);
    assert(
      Number.isInteger(match.round) && match.round >= 1 && match.round <= 8,
      `${context}: round is valid`,
    );
    assert(isSeat(match.currentSeat), `${context}: current seat is valid`);
    assert((STEPS as readonly unknown[]).includes(match.step), `${context}: match step is valid`);
    assert(
      typeof match.turnId === "string" && match.turnId.length > 0,
      `${context}: turnId is present`,
    );
    assert(Number.isSafeInteger(match.turnDeadline), `${context}: turn deadline is an integer`);
    assertTower(match.towers[1], `${context}: seat 1`);
    assertTower(match.towers[2], `${context}: seat 2`);
  }

  if (state.phase === "countdown") {
    assert(state.match !== null, `${context}: countdown carries its next match`);
    assert(Number.isSafeInteger(state.countdownEndsAt), `${context}: countdown has an end time`);
  } else {
    assert.equal(state.countdownEndsAt, null, `${context}: only countdown has an end time`);
  }

  if (state.phase === "finished") {
    assert(state.result !== null, `${context}: finished state has a result`);
    assert(
      (RESULT_REASONS as readonly unknown[]).includes(state.result.reason),
      `${context}: result reason is valid`,
    );
    assert(
      state.result.winner === "tie" || isSeat(state.result.winner),
      `${context}: result winner is valid`,
    );
  } else {
    assert.equal(state.result, null, `${context}: unfinished state has no result`);
  }

  assert.equal(
    new Set(state.rematchVotes).size,
    state.rematchVotes.length,
    `${context}: rematch votes are unique`,
  );
  for (const vote of state.rematchVotes) assert(isSeat(vote), `${context}: rematch vote is a seat`);
  if (state.phase !== "finished") {
    assert.equal(
      state.rematchVotes.length,
      0,
      `${context}: only finished games retain rematch votes`,
    );
  }

  if (state.lastEvent !== null) assertEvent(state.lastEvent, context);
}

interface ClientConnectInput {
  label: string;
  code: string;
  playerId: string;
  name: string;
  intent: "create" | "join";
  playerIds: ReadonlySet<string>;
  deadline: Deadline;
}

class SmokeClient {
  readonly label: string;
  readonly code: string;
  readonly playerIds: ReadonlySet<string>;
  readonly socket: WebSocket;
  private readonly deadline: Deadline;
  private readonly opened = deferred<void>();
  private readonly inbox: ServerMessage[] = [];
  private readonly messageWaiters: PendingMessage[] = [];
  private readonly closeWaiters: PendingClose[] = [];
  private readonly protocolProblems: Error[] = [];
  private closeRecord: CloseRecord | undefined;
  private sawOpen = false;
  private previousVersion = -1;

  private constructor(input: ClientConnectInput) {
    this.label = input.label;
    this.code = input.code;
    this.playerIds = input.playerIds;
    this.deadline = input.deadline;
    this.socket = new WebSocket(partyUrl(input.code, input.playerId, input.name, input.intent));
    this.installListeners();
  }

  static async connect(input: ClientConnectInput): Promise<SmokeClient> {
    const client = new SmokeClient(input);
    await client.deadline.wait(
      client.opened.promise,
      `${client.label} WebSocket open`,
      CONNECT_TIMEOUT_MS,
    );
    return client;
  }

  private installListeners(): void {
    this.socket.addEventListener("open", () => {
      this.sawOpen = true;
      this.opened.resolve();
    });
    this.socket.addEventListener("error", () => {
      if (!this.sawOpen)
        this.opened.reject(new Error(`${this.label} WebSocket failed before opening`));
    });
    this.socket.addEventListener("close", (event) => {
      const record = { code: event.code, reason: event.reason };
      this.closeRecord = record;
      if (!this.sawOpen) {
        this.opened.reject(
          new Error(
            `${this.label} closed before opening (${record.code}: ${record.reason || "no reason"})`,
          ),
        );
      }
      for (const waiter of this.closeWaiters.splice(0)) waiter.resolve(record);
    });
    this.socket.addEventListener("message", (event) => this.receive(event.data));
  }

  private receive(raw: unknown): void {
    if (typeof raw !== "string") {
      this.protocolProblems.push(new Error(`${this.label} received a non-text WebSocket message`));
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.protocolProblems.push(new Error(`${this.label} received invalid JSON: ${raw}`));
      return;
    }

    if (!isServerMessage(parsed)) {
      this.protocolProblems.push(
        new Error(`${this.label} received an invalid server message: ${raw}`),
      );
      return;
    }

    if (parsed.type === "state") {
      try {
        assertRoomState(parsed.state, this.code, this.playerIds, `${this.label} inbound state`);
        assert(
          parsed.state.version >= this.previousVersion,
          `${this.label}: WebSocket states must not decrease in version`,
        );
        this.previousVersion = parsed.state.version;
      } catch (error) {
        this.protocolProblems.push(error instanceof Error ? error : new Error(String(error)));
        return;
      }
    }

    const waiterIndex = this.messageWaiters.findIndex((waiter) => waiter.predicate(parsed));
    if (waiterIndex >= 0) {
      const waiter = this.messageWaiters.splice(waiterIndex, 1)[0];
      assert(waiter !== undefined, `${this.label}: matched message waiter exists`);
      waiter.resolve(parsed);
    } else {
      this.inbox.push(parsed);
    }
  }

  private throwProtocolProblems(): void {
    if (this.protocolProblems.length > 0) throw this.protocolProblems[0];
  }

  async waitFor<T extends ServerMessage>(
    description: string,
    predicate: (message: ServerMessage) => message is T,
    timeoutMs = ACTION_TIMEOUT_MS,
  ): Promise<T> {
    this.throwProtocolProblems();
    const inboxIndex = this.inbox.findIndex(predicate);
    if (inboxIndex >= 0) return this.inbox.splice(inboxIndex, 1)[0] as T;

    const message = await this.deadline.wait(
      new Promise<ServerMessage>((resolve) => {
        this.messageWaiters.push({ description, predicate, resolve });
      }),
      `${this.label}: ${description}`,
      timeoutMs,
    );
    this.throwProtocolProblems();
    return message as T;
  }

  async waitForState(
    description: string,
    predicate: (state: RoomState) => boolean,
    timeoutMs = ACTION_TIMEOUT_MS,
  ): Promise<RoomState> {
    const message = await this.waitFor(
      description,
      (candidate): candidate is Extract<ServerMessage, { type: "state" }> =>
        candidate.type === "state" && predicate(candidate.state),
      timeoutMs,
    );
    return message.state;
  }

  async waitForError(code: ErrorCode): Promise<Extract<ServerMessage, { type: "error" }>> {
    return this.waitFor(
      `${code} error`,
      (candidate): candidate is Extract<ServerMessage, { type: "error" }> =>
        candidate.type === "error" && candidate.code === code,
    );
  }

  async waitForClose(description: string): Promise<CloseRecord> {
    if (this.closeRecord !== undefined) return this.closeRecord;
    return this.deadline.wait(
      new Promise<CloseRecord>((resolve) => this.closeWaiters.push({ resolve })),
      `${this.label}: ${description}`,
      CONNECT_TIMEOUT_MS,
    );
  }

  send(message: ClientMessage): void {
    this.throwProtocolProblems();
    assert.equal(
      this.socket.readyState,
      WebSocket.OPEN,
      `${this.label}: socket is open before send`,
    );
    this.socket.send(JSON.stringify(message));
  }

  async disconnectWithoutLeave(reason: string): Promise<CloseRecord> {
    if (this.closeRecord !== undefined) return this.closeRecord;
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close(1000, reason);
    }
    return this.waitForClose("normal disconnect");
  }

  async forceClose(): Promise<void> {
    if (this.closeRecord !== undefined) return;
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close(1000, "smoke cleanup");
    }
    try {
      await this.waitForClose("cleanup close");
    } catch {
      // A failed cleanup must not hide the original assertion failure.
    }
  }
}

function assertWelcome(
  message: Extract<ServerMessage, { type: "welcome" }>,
  seat: Seat,
  code: string,
  context: string,
): void {
  assert.equal(message.seat, seat, `${context}: welcome assigns expected seat`);
  assert.equal(message.code, code, `${context}: welcome has expected code`);
}

async function connectSeat(input: {
  label: string;
  code: string;
  playerId: string;
  name: string;
  intent: "create" | "join";
  seat: Seat;
  playerIds: ReadonlySet<string>;
  deadline: Deadline;
}): Promise<{ client: SmokeClient; initialState: RoomState }> {
  const client = await SmokeClient.connect(input);
  const welcome = await client.waitFor(
    "welcome",
    (candidate): candidate is Extract<ServerMessage, { type: "welcome" }> =>
      candidate.type === "welcome",
  );
  assertWelcome(welcome, input.seat, input.code, input.label);
  const initialState = await client.waitForState("initial state", () => true);
  return { client, initialState };
}

async function expectFatal(input: {
  label: string;
  code: string;
  playerId: string;
  name: string;
  intent: "create" | "join";
  expected: ErrorCode;
  playerIds: ReadonlySet<string>;
  deadline: Deadline;
}): Promise<void> {
  const client = await SmokeClient.connect(input);
  try {
    const error = await client.waitForError(input.expected);
    assert.equal(error.code, input.expected, `${input.label}: expected fatal error message`);
    const close = await client.waitForClose("fatal-error close");
    assert.equal(close.code, 4000, `${input.label}: fatal error uses close code 4000`);
    assert.equal(
      close.reason,
      input.expected,
      `${input.label}: fatal close reason is the error code`,
    );
  } finally {
    await client.forceClose();
  }
}

function oppositeSeat(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}

function assertBothPlayers(state: RoomState, context: string): void {
  assert(
    state.players[1] !== undefined && state.players[2] !== undefined,
    `${context}: both seats are filled`,
  );
}

async function settleRoll(
  source: SmokeClient,
  before: RoomState,
  expectedEvent: "power" | "cannon",
): Promise<RoomState> {
  const resolving = await source.waitForState(
    `${expectedEvent} resolving state`,
    (state) =>
      state.version > before.version &&
      state.phase === "playing" &&
      state.match?.step === "resolving" &&
      state.lastEvent?.type === expectedEvent &&
      state.lastEvent.actor === before.match?.currentSeat,
  );
  assert(resolving.match !== null, "Resolving state retains its match");
  assert.equal(
    resolving.match.currentSeat,
    before.match?.currentSeat,
    "Roll does not change current seat early",
  );

  return source.waitForState(
    `${expectedEvent} resolution end`,
    (state) =>
      state.version > resolving.version &&
      (state.phase === "finished" ||
        (state.phase === "playing" && state.match?.step !== "resolving")),
    expectedEvent === "power" ? POWER_RESOLVE_MS + 5_000 : CANNON_RESOLVE_MS + 5_000,
  );
}

async function playFullMatch(input: {
  source: SmokeClient;
  clients: Record<Seat, SmokeClient>;
  initialState: RoomState;
}): Promise<RoomState> {
  let state = input.initialState;
  let letFirstCannonTimeout = true;
  let turns = 0;

  while (state.phase === "playing") {
    assert(state.match !== null, "Playing state has a match");
    const { match } = state;
    const actor = input.clients[match.currentSeat];

    if (match.step === "resolving") {
      state = await input.source.waitForState(
        "an already-resolving step to end",
        (candidate) =>
          candidate.version > state.version &&
          (candidate.phase === "finished" || candidate.match?.step !== "resolving"),
        CANNON_RESOLVE_MS + 5_000,
      );
      continue;
    }

    if (match.step === "power") {
      actor.send({ type: "rollPower", turnId: match.turnId });
      state = await settleRoll(input.source, state, "power");
      turns += 1;
      continue;
    }

    assert.equal(match.step, "cannon", "Non-power active step is cannon");
    if (letFirstCannonTimeout) {
      note(`letting the first Cannon step time out (seat ${match.currentSeat})`);
      state = await input.source.waitForState(
        "first cannon timeout",
        (candidate) =>
          candidate.version > state.version &&
          candidate.lastEvent?.type === "turnSkipped" &&
          candidate.lastEvent.actor === match.currentSeat,
        STEP_MS + 5_000,
      );
      letFirstCannonTimeout = false;
    } else {
      actor.send({ type: "rollCannon", turnId: match.turnId });
      state = await settleRoll(input.source, state, "cannon");
    }
    turns += 1;
  }

  assert.equal(letFirstCannonTimeout, false, "The match exercised a Cannon timeout");
  assert.equal(state.phase, "finished", "Full match reaches finished");
  assert(state.match !== null, "Finished match remains available for rematch");
  assert(state.result !== null, "Finished match includes a result");
  assert.equal(state.rematchVotes.length, 0, "Finished match begins with no rematch votes");
  note(
    `match 1 finished after ${turns} actions: ${state.result.reason}, winner ${String(state.result.winner)}`,
  );
  return state;
}

async function measureIdleRetention(input: {
  deadline: Deadline;
  playerIds: Set<string>;
  clients: Set<SmokeClient>;
  idleProbeMs: number[];
}): Promise<void> {
  const code = makeRoomCode();
  const playerId = makePlayerId("idle");
  input.playerIds.add(playerId);

  const initial = await connectSeat({
    label: "idle room host",
    code,
    playerId,
    name: "Idle Host",
    intent: "create",
    seat: 1,
    playerIds: input.playerIds,
    deadline: input.deadline,
  });
  input.clients.add(initial.client);
  assert.equal(initial.initialState.phase, "lobby", "Idle room starts in the lobby");
  assert(initial.initialState.players[1] !== undefined, "Idle room host occupies seat 1");

  const idleStartedAt = Date.now();
  const initialClose = await initial.client.disconnectWithoutLeave("idle lifetime setup");
  assert.equal(initialClose.code, 1000, "Idle probe setup disconnects normally without Leave");
  note(`idle-retention room ${code}: all clients disconnected without Leave`);

  let lastRetainedMs = 0;
  for (const targetMs of input.idleProbeMs) {
    await input.deadline.sleepUntil(idleStartedAt + targetMs, `idle probe at ${targetMs} ms`);
    const probe = await SmokeClient.connect({
      label: `idle probe at ${targetMs}ms`,
      code,
      playerId,
      name: "Different Name Ignored",
      intent: "join",
      playerIds: input.playerIds,
      deadline: input.deadline,
    });
    input.clients.add(probe);

    const firstResponse = await probe.waitFor(
      "idle probe welcome or error",
      (
        candidate,
      ): candidate is
        Extract<ServerMessage, { type: "welcome" }> | Extract<ServerMessage, { type: "error" }> =>
        candidate.type === "welcome" || candidate.type === "error",
    );
    if (firstResponse.type === "error") {
      assert.equal(
        firstResponse.code,
        "ROOM_NOT_FOUND",
        "An unloaded idle room reports ROOM_NOT_FOUND",
      );
      const close = await probe.waitForClose("idle-room-not-found close");
      assert.equal(close.code, 4000, "Idle ROOM_NOT_FOUND uses the fatal close code");
      note(
        `idle retention lost by ${(targetMs / 1_000).toFixed(1)}s; ` +
          `last retained probe was ${(lastRetainedMs / 1_000).toFixed(1)}s`,
      );
      return;
    }

    assertWelcome(firstResponse, 1, code, `idle probe at ${targetMs}ms`);
    const state = await probe.waitForState("idle probe state", () => true);
    assert.equal(state.phase, "lobby", "Idle probe reconnects to the lobby");
    assert.equal(state.players[1]?.name, "Idle Host", "Reconnect keeps the original name");
    assert.equal(state.players[1]?.connected, true, "Reconnect marks its held seat connected");
    const close = await probe.disconnectWithoutLeave("idle retention probe");
    assert.equal(close.code, 1000, "Idle probe disconnects normally without Leave");
    lastRetainedMs = targetMs;
    note(`idle retention observed through ${(targetMs / 1_000).toFixed(1)}s`);
  }

  note(
    `idle retention lower bound: ${(lastRetainedMs / 1_000).toFixed(1)}s ` +
      "(fresh reconnect probes may reset PartyKit's own idle clock)",
  );
}

let transcriptStartedAt = Date.now();

function note(message: string): void {
  const elapsedSeconds = ((Date.now() - transcriptStartedAt) / 1_000).toFixed(1).padStart(5);
  console.log(`[${elapsedSeconds}s] ${message}`);
}

async function run(): Promise<void> {
  const settings = readSettings();
  const deadline = new Deadline(settings.overallTimeoutMs);
  const playerIds = new Set<string>();
  const clients = new Set<SmokeClient>();
  transcriptStartedAt = Date.now();
  note(
    `starting local-only smoke against ${SERVER_ORIGIN}; idle probes at ` +
      `${settings.idleProbeMs.map((value) => `${value / 1_000}s`).join(", ")}`,
  );

  try {
    const missingCode = makeRoomCode();
    const missingPlayerId = makePlayerId("missing");
    playerIds.add(missingPlayerId);
    await expectFatal({
      label: "ROOM_NOT_FOUND probe",
      code: missingCode,
      playerId: missingPlayerId,
      name: "Missing",
      intent: "join",
      expected: "ROOM_NOT_FOUND",
      playerIds,
      deadline,
    });
    note("ROOM_NOT_FOUND verified");

    const code = makeRoomCode();
    const hostPlayerId = makePlayerId("host");
    const guestPlayerId = makePlayerId("guest");
    playerIds.add(hostPlayerId);
    playerIds.add(guestPlayerId);

    const hostConnection = await connectSeat({
      label: "host",
      code,
      playerId: hostPlayerId,
      name: "Host",
      intent: "create",
      seat: 1,
      playerIds,
      deadline,
    });
    const host = hostConnection.client;
    clients.add(host);
    assert.equal(hostConnection.initialState.phase, "lobby", "Host begins in lobby");
    assert.deepEqual(
      Object.keys(hostConnection.initialState.players),
      ["1"],
      "Host is the only initial player",
    );
    assert.equal(hostConnection.initialState.players[1]?.name, "Host", "Host name is retained");

    const codeTakenPlayerId = makePlayerId("taken");
    playerIds.add(codeTakenPlayerId);
    await expectFatal({
      label: "CODE_TAKEN probe",
      code,
      playerId: codeTakenPlayerId,
      name: "Duplicate Creator",
      intent: "create",
      expected: "CODE_TAKEN",
      playerIds,
      deadline,
    });
    note("CODE_TAKEN verified");

    const guestConnection = await connectSeat({
      label: "guest",
      code,
      playerId: guestPlayerId,
      name: "Guest",
      intent: "join",
      seat: 2,
      playerIds,
      deadline,
    });
    const guest = guestConnection.client;
    clients.add(guest);
    assertBothPlayers(guestConnection.initialState, "Guest join state");
    const joinedState = await host.waitForState(
      "guest join broadcast",
      (state) => state.players[2] !== undefined,
    );
    assertBothPlayers(joinedState, "Host join state");
    assert.equal(joinedState.players[2]?.name, "Guest", "Guest name is broadcast");

    const fullPlayerId = makePlayerId("full");
    playerIds.add(fullPlayerId);
    await expectFatal({
      label: "ROOM_FULL probe",
      code,
      playerId: fullPlayerId,
      name: "Third Player",
      intent: "join",
      expected: "ROOM_FULL",
      playerIds,
      deadline,
    });
    note("ROOM_FULL verified");

    host.send({ type: "ready" });
    await host.waitForState(
      "host ready state",
      (state) => state.phase === "lobby" && state.players[1]?.ready === true,
    );
    guest.send({ type: "ready" });
    const countdown = await host.waitForState(
      "countdown after both ready",
      (state) => state.phase === "countdown",
    );
    await guest.waitForState("countdown after both ready", (state) => state.phase === "countdown");
    assert(countdown.match !== null, "Countdown creates a match");
    assert.equal(countdown.match.firstSeat, 1, "Match 1 starts with the host");
    assert.equal(countdown.match.currentSeat, 1, "Match 1 starts at the host turn");
    assert.equal(countdown.match.step, "cannon", "Round 1 starts with Cannon");

    const playing = await host.waitForState(
      "playing after countdown",
      (state) => state.version > countdown.version && state.phase === "playing",
      COUNTDOWN_MS + 5_000,
    );
    await guest.waitForState(
      "playing after countdown",
      (state) => state.phase === "playing",
      COUNTDOWN_MS + 5_000,
    );
    assert(playing.match !== null, "Playing state has a match");
    assert.equal(
      playing.match.turnDeadline > playing.serverNow,
      true,
      "First step has a future deadline",
    );

    const inProgressPlayerId = makePlayerId("in-progress");
    playerIds.add(inProgressPlayerId);
    await expectFatal({
      label: "GAME_IN_PROGRESS probe",
      code,
      playerId: inProgressPlayerId,
      name: "Late Joiner",
      intent: "join",
      expected: "GAME_IN_PROGRESS",
      playerIds,
      deadline,
    });
    note("GAME_IN_PROGRESS verified");

    const refreshedConnection = await connectSeat({
      label: "host refresh",
      code,
      playerId: hostPlayerId,
      name: "Replacement Name",
      intent: "join",
      seat: 1,
      playerIds,
      deadline,
    });
    const refreshedHost = refreshedConnection.client;
    clients.add(refreshedHost);
    const replacementError = await host.waitForError("REPLACED_BY_NEW_TAB");
    assert.equal(
      replacementError.code,
      "REPLACED_BY_NEW_TAB",
      "Old tab receives replacement error",
    );
    const replacementClose = await host.waitForClose("replacement close");
    assert.equal(replacementClose.code, 4000, "Old tab closes with fatal close code");
    assert.equal(
      replacementClose.reason,
      "REPLACED_BY_NEW_TAB",
      "Old tab close reason identifies replacement",
    );
    assert(refreshedConnection.initialState.match !== null, "Refresh receives the active match");
    assert.equal(
      refreshedConnection.initialState.phase,
      "playing",
      "Refresh stays in the active match",
    );
    assert.equal(
      refreshedConnection.initialState.players[1]?.name,
      "Host",
      "Refresh keeps original name",
    );
    assert.equal(
      refreshedConnection.initialState.players[1]?.connected,
      true,
      "Refresh keeps seat connected",
    );
    assert.equal(
      refreshedConnection.initialState.match.turnId,
      playing.match.turnId,
      "Refresh preserves the mid-turn turnId",
    );
    note("mid-turn refresh and REPLACED_BY_NEW_TAB verified");

    const finished = await playFullMatch({
      source: refreshedHost,
      clients: { 1: refreshedHost, 2: guest },
      initialState: refreshedConnection.initialState,
    });

    assert(finished.match !== null, "Finished state keeps the match for a rematch");
    const firstSeat = finished.match.firstSeat;
    refreshedHost.send({ type: "rematch" });
    const oneVote = await refreshedHost.waitForState(
      "first rematch vote",
      (state) => state.phase === "finished" && state.rematchVotes.includes(1),
    );
    assert.deepEqual(oneVote.rematchVotes, [1], "First vote is visible to both clients");
    guest.send({ type: "rematch" });
    const rematchCountdown = await refreshedHost.waitForState(
      "rematch countdown",
      (state) => state.version > oneVote.version && state.phase === "countdown",
    );
    assert(rematchCountdown.match !== null, "Rematch countdown carries match 2");
    assert.equal(
      rematchCountdown.match.number,
      finished.match.number + 1,
      "Rematch increments match number",
    );
    assert.equal(
      rematchCountdown.match.firstSeat,
      oppositeSeat(firstSeat),
      "Rematch alternates first seat",
    );
    assert.equal(rematchCountdown.rematchVotes.length, 0, "Rematch clears votes");
    assert.equal(rematchCountdown.match.towers[1].hp, MAX_HP, "Rematch resets seat 1 HP");
    assert.equal(rematchCountdown.match.towers[2].hp, MAX_HP, "Rematch resets seat 2 HP");
    assert.equal(rematchCountdown.match.towers[1].shield, false, "Rematch clears seat 1 Shield");
    assert.equal(
      rematchCountdown.match.towers[2].reflectNextAttack,
      false,
      "Rematch clears seat 2 Ricochet",
    );

    const secondMatchPlaying = await refreshedHost.waitForState(
      "second match playing",
      (state) => state.version > rematchCountdown.version && state.phase === "playing",
      COUNTDOWN_MS + 5_000,
    );
    assert(secondMatchPlaying.match !== null, "Second match starts after rematch countdown");
    assert.equal(secondMatchPlaying.match.number, 2, "Second match number is 2");
    assert.equal(
      secondMatchPlaying.match.currentSeat,
      oppositeSeat(firstSeat),
      "Second match starts with the alternated first seat",
    );
    note(`rematch started with seat ${secondMatchPlaying.match.firstSeat} first`);

    guest.send({ type: "leave" });
    const leftState = await refreshedHost.waitForState(
      "opponent leave result",
      (state) => state.phase === "finished" && state.result?.reason === "left",
    );
    assert.equal(leftState.result?.winner, 1, "Remaining host wins when guest leaves");
    assert.equal(leftState.players[2], undefined, "Leave frees the guest seat");
    assert.equal(leftState.hostSeat, 1, "Remaining player becomes host");
    const normalLeaveClose = await guest.waitForClose("normal leave close");
    assert.equal(normalLeaveClose.code, 1000, "Normal Leave closes with code 1000");
    note("normal Leave and close code 1000 verified");

    await measureIdleRetention({
      deadline,
      playerIds,
      clients,
      idleProbeMs: settings.idleProbeMs,
    });
    note("two-player smoke completed successfully");
  } finally {
    await Promise.all([...clients].map((client) => client.forceClose()));
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  throw error;
});
