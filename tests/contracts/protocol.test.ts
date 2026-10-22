import { describe, expect, it } from "vitest";
import {
  FATAL_ERROR_CODES,
  ERROR_CODES,
  MAX_MESSAGE_LENGTH,
  NAME_MAX_LENGTH,
} from "../../shared/constants.ts";
import { NotImplementedError } from "../../shared/errors.ts";
import {
  isFatalError,
  limitNameInput,
  makeTurnId,
  opponent,
  parseClientMessage,
  parseConnectParams,
  sanitizeName,
} from "../../shared/protocol.ts";
import { startMatch } from "../../shared/rules.ts";
import { createCryptoRng } from "../../shared/rng.ts";

describe("parseClientMessage", () => {
  it.each([
    ['{"type":"ready"}', { type: "ready" }],
    ['{"type":"rematch"}', { type: "rematch" }],
    ['{"type":"leave"}', { type: "leave" }],
    [
      '{"type":"rollPower","turnId":"m1-r3-s1-power"}',
      { type: "rollPower", turnId: "m1-r3-s1-power" },
    ],
    [
      '{"type":"rollCannon","turnId":"m1-r1-s2-cannon"}',
      { type: "rollCannon", turnId: "m1-r1-s2-cannon" },
    ],
  ])("accepts %s", (raw, expected) => {
    expect(parseClientMessage(raw)).toEqual(expected);
  });

  it("strips unknown fields, so a client cannot send outcomes", () => {
    const raw = JSON.stringify({
      type: "rollCannon",
      turnId: "t",
      dice: [6, 6],
      damage: 36,
      hp: 50,
    });
    expect(parseClientMessage(raw)).toEqual({ type: "rollCannon", turnId: "t" });
    expect(parseClientMessage('{"type":"ready","seat":2}')).toEqual({ type: "ready" });
  });

  it.each([
    ["invalid JSON", "{type:ready}"],
    ["empty string", ""],
    ["JSON null", "null"],
    ["JSON array", '[{"type":"ready"}]'],
    ["JSON string", '"ready"'],
    ["JSON number", "42"],
    ["missing type", "{}"],
    ["unknown type", '{"type":"setHp","hp":50}'],
    ["type wrong case", '{"type":"Ready"}'],
    ["type not a string", '{"type":1}'],
    ["rollPower without turnId", '{"type":"rollPower"}'],
    ["rollCannon with empty turnId", '{"type":"rollCannon","turnId":""}'],
    ["turnId not a string", '{"type":"rollCannon","turnId":7}'],
    ["turnId too long", JSON.stringify({ type: "rollCannon", turnId: "x".repeat(65) })],
    ["oversized message", JSON.stringify({ type: "ready", pad: "x".repeat(MAX_MESSAGE_LENGTH) })],
    ["prototype key", '{"__proto__":{"type":"ready"}}'],
  ])("rejects %s", (_label, raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });

  it.each([undefined, null, 42, {}, new ArrayBuffer(4)])("rejects non-string input %#", (raw) => {
    expect(parseClientMessage(raw)).toBeNull();
  });
});

describe("parseConnectParams", () => {
  const url = (query: string) => new URL(`http://localhost:1999/parties/main/KX7P?${query}`);
  const id = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";

  it("reads playerId, name and intent", () => {
    expect(parseConnectParams(url(`playerId=${id}&name=Desmond&intent=create`))).toEqual({
      playerId: id,
      name: "Desmond",
      intent: "create",
    });
  });

  it("treats a missing name as empty (sanitised later)", () => {
    expect(parseConnectParams(url(`playerId=${id}&intent=join`))?.name).toBe("");
  });

  it("decodes an encoded name without sanitising it", () => {
    expect(parseConnectParams(url(`playerId=${id}&intent=join&name=%20A%20%20B%20`))?.name).toBe(
      " A  B ",
    );
  });

  it.each([
    ["missing playerId", "intent=join"],
    ["empty playerId", "playerId=&intent=join"],
    ["playerId too short", "playerId=abc&intent=join"],
    ["playerId with bad characters", "playerId=abc%20def%3Cghi&intent=join"],
    ["playerId too long", `playerId=${"a".repeat(65)}&intent=join`],
    ["missing intent", `playerId=${id}`],
    ["unknown intent", `playerId=${id}&intent=spectate`],
  ])("rejects %s", (_label, query) => {
    expect(parseConnectParams(url(query))).toBeNull();
  });
});

describe("sanitizeName", () => {
  it.each([
    ["Desmond", 1, "Desmond"],
    ["  Desmond  ", 1, "Desmond"],
    ["Des   mond", 1, "Des mond"],
    ["Tab\tand\nnewline", 1, "Tab and newl"],
    ["a\r\n\r\nb", 1, "a b"],
    ["Bell\u0007char", 2, "Bellchar"],
    ["", 1, "Player 1"],
    ["   ", 2, "Player 2"],
    ["\u0000\u0001", 2, "Player 2"],
    ["ABCDEFGHIJKLMNOP", 1, "ABCDEFGHIJKL"],
    ["Eleven char ", 1, "Eleven char"],
    ["ABCDEFGHIJK  Z", 1, "ABCDEFGHIJK"],
    ["王者骰子王国大乱斗冠军选手", 1, "王者骰子王国大乱斗冠军选"],
    ["👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽", 1, "👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽👍🏽"],
    ["family👨‍👩‍👧 rocks", 1, "family👨‍👩‍👧 rock"],
  ] as const)("%j (seat %i) → %j", (raw, seat, expected) => {
    expect(sanitizeName(raw, seat)).toBe(expected);
  });

  it("never returns more than NAME_MAX_LENGTH graphemes", () => {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const count = (s: string) => Array.from(segmenter.segment(s)).length;
    expect(count(sanitizeName("x".repeat(500), 1))).toBe(NAME_MAX_LENGTH);
  });
});

describe("limitNameInput", () => {
  it("keeps short input unchanged, including spaces", () => {
    expect(limitNameInput("Des ")).toBe("Des ");
    expect(limitNameInput("")).toBe("");
  });

  it("cuts to NAME_MAX_LENGTH characters", () => {
    expect(limitNameInput("ABCDEFGHIJKLMNOP")).toBe("ABCDEFGHIJKL");
  });

  it("never splits an emoji", () => {
    const thumbs = "👍🏽";
    expect(limitNameInput(thumbs.repeat(13))).toBe(thumbs.repeat(12));
    expect(limitNameInput(`${"a".repeat(11)}👨‍👩‍👧b`)).toBe(`${"a".repeat(11)}👨‍👩‍👧`);
  });
});

describe("small helpers", () => {
  it("makeTurnId uses the m{match}-r{round}-s{seat}-{step} format", () => {
    expect(makeTurnId(2, 3, 1, "power")).toBe("m2-r3-s1-power");
    expect(makeTurnId(1, 8, 2, "resolving")).toBe("m1-r8-s2-resolving");
  });

  it("opponent returns the other seat", () => {
    expect(opponent(1)).toBe(2);
    expect(opponent(2)).toBe(1);
  });

  it("isFatalError matches FATAL_ERROR_CODES exactly", () => {
    const fatal = ERROR_CODES.filter(isFatalError);
    expect(fatal).toEqual([...FATAL_ERROR_CODES]);
    expect(isFatalError("INVALID_MESSAGE")).toBe(false);
    expect(ERROR_CODES).toHaveLength(9);
  });
});

describe("stubs", () => {
  it("throw NotImplementedError naming the function and the owning change", () => {
    expect(() => startMatch({ number: 1, firstSeat: 1, towerSeed: 1 })).toThrow(
      NotImplementedError,
    );
    expect(() => createCryptoRng()).toThrow(
      /createCryptoRng is not implemented yet \(implemented in build-game-server\)/,
    );
  });
});
