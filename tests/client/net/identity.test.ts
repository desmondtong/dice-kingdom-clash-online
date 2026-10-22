import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_CODE_ALPHABET } from "../../../shared/constants.ts";
import {
  forgetRoom,
  generateRoomCode,
  getPlayerId,
  hasJoinedRoom,
  isRoomCode,
  loadNickname,
  normalizeRoomCode,
  rememberRoom,
  saveNickname,
} from "../../../src/net/identity.ts";

describe("tab identity", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  it("keeps the same UUID through refresh, but a new tab session gets a new one", () => {
    const id = getPlayerId();
    expect(getPlayerId()).toBe(id);
    sessionStorage.clear();
    expect(getPlayerId()).not.toBe(id);
  });
  it("stores nicknames independently of tab sessions and limits grapheme clusters", () => {
    saveNickname("👩🏽‍🚀".repeat(15));
    sessionStorage.clear();
    expect(loadNickname()).toBe("👩🏽‍🚀".repeat(12));
  });
  it("remembers and forgets individual rooms without duplicates", () => {
    rememberRoom("KX7P");
    rememberRoom("KX7P");
    rememberRoom("ABCD");
    forgetRoom("KX7P");
    expect(hasJoinedRoom("KX7P")).toBe(false);
    expect(hasJoinedRoom("ABCD")).toBe(true);
  });
  it("recovers from malformed stored membership", () => {
    sessionStorage.setItem("dkc.rooms", "bad-json");
    expect(hasJoinedRoom("KX7P")).toBe(false);
    sessionStorage.setItem("dkc.rooms", JSON.stringify([null, 5, "KX7P", "invalid"]));
    expect(hasJoinedRoom("KX7P")).toBe(true);
  });
  it("uppercases and validates the frozen alphabet", () => {
    expect(normalizeRoomCode(" kx7p ")).toBe("KX7P");
    expect(isRoomCode("KX7P")).toBe(true);
    for (const code of ["AB1D", "AB0D", "ABOD", "ABID", "ABLD", "ABC", "ABCDE"])
      expect(isRoomCode(code)).toBe(false);
  });
  it("generates only four allowed symbols", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(4);
      expect(Array.from(code).every((letter) => ROOM_CODE_ALPHABET.includes(letter))).toBe(true);
    }
  });
  it("rejects biased bytes instead of mapping them", () => {
    const random = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementationOnce((array) => {
        const bytes = array as Uint8Array;
        bytes.set([255, 0, 1, 2]);
        return array;
      })
      .mockImplementationOnce((array) => {
        const bytes = array as Uint8Array;
        bytes.set([3, 4, 5, 6]);
        return array;
      });
    expect(generateRoomCode()).toBe("ABCD");
    random.mockRestore();
  });
});
