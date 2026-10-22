import { PLAYER_ID_PATTERN, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../../shared/constants.ts";
import { limitNameInput } from "../../shared/protocol.ts";

const PLAYER_KEY = "dkc.playerId";
const NAME_KEY = "dkc.nickname";
const ROOMS_KEY = "dkc.rooms";

export function getPlayerId(): string {
  const saved = sessionStorage.getItem(PLAYER_KEY);
  if (saved && PLAYER_ID_PATTERN.test(saved)) return saved;
  const id = crypto.randomUUID();
  sessionStorage.setItem(PLAYER_KEY, id);
  return id;
}

export function loadNickname(): string {
  return limitNameInput(localStorage.getItem(NAME_KEY) ?? "");
}

export function saveNickname(name: string): void {
  localStorage.setItem(NAME_KEY, limitNameInput(name));
}

function joinedRooms(): string[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(ROOMS_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((code): code is string => typeof code === "string" && isRoomCode(code))
      : [];
  } catch {
    return [];
  }
}

export function hasJoinedRoom(code: string): boolean {
  return joinedRooms().includes(code);
}

export function rememberRoom(code: string): void {
  sessionStorage.setItem(ROOMS_KEY, JSON.stringify([...new Set([...joinedRooms(), code])]));
}

export function forgetRoom(code: string): void {
  sessionStorage.setItem(ROOMS_KEY, JSON.stringify(joinedRooms().filter((room) => room !== code)));
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isRoomCode(code: string): boolean {
  return (
    code.length === ROOM_CODE_LENGTH &&
    Array.from(code).every((letter) => ROOM_CODE_ALPHABET.includes(letter))
  );
}

/** Rejection sampling avoids modulo bias. This randomness is for codes, never game outcomes. */
export function generateRoomCode(): string {
  let code = "";
  const limit = Math.floor(256 / ROOM_CODE_ALPHABET.length) * ROOM_CODE_ALPHABET.length;
  while (code.length < ROOM_CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
    for (const byte of bytes) {
      if (byte < limit && code.length < ROOM_CODE_LENGTH)
        code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
    }
  }
  return code;
}
