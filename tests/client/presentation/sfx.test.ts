import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANNON_RESOLVE_MS, POWER_RESOLVE_MS } from "../../../shared/constants.ts";
import type { GameEvent } from "../../../shared/types.ts";
import { createSfx, eventSoundNames } from "../../../src/audio/sfx.ts";

class AudioMock {
  static created: AudioMock[] = [];
  static rejectNextPlay = false;

  addEventListener = vi.fn();
  cloneNode = vi.fn(() => new AudioMock(this.src));
  currentTime = 0;
  loop = false;
  pause = vi.fn();
  play = vi.fn(() => {
    if (AudioMock.rejectNextPlay) {
      AudioMock.rejectNextPlay = false;
      return Promise.reject(new Error("autoplay blocked"));
    }
    return Promise.resolve();
  });
  volume = 1;

  constructor(public src: string) {
    AudioMock.created.push(this);
  }
}

function playedSources(): string[] {
  return AudioMock.created
    .filter((audio) => audio.play.mock.calls.length > 0)
    .map((audio) => audio.src);
}

const cannonEvent: GameEvent = {
  eventId: 1,
  type: "cannon",
  actor: 1,
  dice: [4, 5],
  rawDamage: 20,
  target: 1,
  reflected: true,
  shielded: true,
  damage: 10,
};

describe("sfx", () => {
  beforeEach(() => {
    AudioMock.created = [];
    AudioMock.rejectNextPlay = false;
    vi.stubGlobal("Audio", AudioMock as unknown as typeof Audio);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("maps every authoritative event to its sound names without side effects", () => {
    expect(eventSoundNames(cannonEvent)).toEqual([
      "rollCannon",
      "ricochet",
      "shield",
      "destroyTower",
    ]);
    expect(
      eventSoundNames({ eventId: 2, type: "power", actor: 1, power: "shield", auto: false }),
    ).toEqual(["getItem"]);
    expect(
      eventSoundNames({ eventId: 3, type: "power", actor: 1, power: "ricochet", auto: false }),
    ).toEqual(["getItem"]);
    expect(
      eventSoundNames({
        eventId: 4,
        type: "power",
        actor: 1,
        power: "heal",
        healAmount: 10,
        auto: false,
      }),
    ).toEqual(["heal", "heal2"]);
    expect(
      eventSoundNames({ eventId: 5, type: "power", actor: 1, power: "swap", auto: false }),
    ).toEqual(["swap", "swap2"]);
    expect(eventSoundNames({ eventId: 6, type: "turnSkipped", actor: 1 })).toEqual([]);
  });

  it("starts BGM only once on unlock at the approved loop volume and swallows playback rejection", async () => {
    const controller = createSfx();
    AudioMock.rejectNextPlay = true;

    controller.unlock();
    controller.unlock();
    await Promise.resolve();

    expect(AudioMock.created).toHaveLength(1);
    expect(AudioMock.created[0]).toMatchObject({
      src: "/assets/game-music.mp3",
      loop: true,
      volume: 0.2,
    });
    expect(AudioMock.created[0]!.play).toHaveBeenCalledOnce();
  });

  it("mutes only the background music and resumes it on unmute", () => {
    const controller = createSfx();
    controller.unlock();
    const bgm = AudioMock.created.find((audio) => audio.src === "/assets/game-music.mp3")!;
    expect(bgm.play).toHaveBeenCalledTimes(1);
    controller.setMusicMuted(true);
    expect(bgm.pause).toHaveBeenCalledTimes(1);
    controller.play("click");
    expect(playedSources()).toContain("/assets/click2.mp3");
    controller.setMusicMuted(false);
    expect(bgm.play).toHaveBeenCalledTimes(2);
  });
  it("does not start the background music on unlock while muted", () => {
    const controller = createSfx();
    controller.setMusicMuted(true);
    controller.unlock();
    expect(playedSources()).not.toContain("/assets/game-music.mp3");
  });
  it("clones and resets effects so overlapping clicks can replay safely", () => {
    const controller = createSfx();
    controller.play("click");
    controller.play("click");

    expect(playedSources()).toEqual(["/assets/click2.mp3", "/assets/click2.mp3"]);
    expect(AudioMock.created.filter((audio) => audio.src === "/assets/click2.mp3")).toHaveLength(3);
  });

  it("plays cannon roll immediately then hit effects at the cannon resolve timing", () => {
    const controller = createSfx();
    controller.playEvent(cannonEvent);
    expect(playedSources()).toEqual(["/assets/roll-cannon.mp3"]);

    vi.advanceTimersByTime(CANNON_RESOLVE_MS * 0.4 - 1);
    expect(playedSources()).toEqual(["/assets/roll-cannon.mp3"]);
    vi.advanceTimersByTime(1);
    expect(playedSources()).toEqual([
      "/assets/roll-cannon.mp3",
      "/assets/ricochet-dice.mp3",
      "/assets/shield-dice.mp3",
      "/assets/destroy-tower-short.mp3",
    ]);
  });

  it.each([
    ["shield", ["/assets/get-item.mp3"]],
    ["ricochet", ["/assets/get-item.mp3"]],
    ["heal", ["/assets/heal-dice.mp3", "/assets/heal-dice-2.wav"]],
    ["swap", ["/assets/swap-dice.mp3", "/assets/swap-dice-2.mp3"]],
  ] as const)(
    "schedules %s power sounds within the power resolve window",
    (power, expectedSources) => {
      const controller = createSfx();
      controller.playEvent({ eventId: 8, type: "power", actor: 1, power, auto: false });

      expect(playedSources()).toEqual([]);
      vi.advanceTimersByTime(POWER_RESOLVE_MS);
      expect(playedSources()).toEqual(expectedSources);
    },
  );

  it("clears delayed effects and active audio when disposed", () => {
    const controller = createSfx();
    controller.unlock();
    controller.playEvent(cannonEvent);
    const activeAtDispose = [...AudioMock.created];

    controller.dispose();
    vi.advanceTimersByTime(CANNON_RESOLVE_MS);

    expect(playedSources()).toEqual(["/assets/game-music.mp3", "/assets/roll-cannon.mp3"]);
    expect(activeAtDispose.some((audio) => audio.pause.mock.calls.length > 0)).toBe(true);
  });
});
