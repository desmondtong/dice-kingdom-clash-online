import { CANNON_RESOLVE_MS, POWER_RESOLVE_MS } from "../../shared/constants.ts";
import type { GameEvent } from "../../shared/types.ts";

export const soundMap = {
  click: "/assets/click2.mp3",
  rollCannon: "/assets/roll-cannon.mp3",
  destroyTower: "/assets/destroy-tower-short.mp3",
  getItem: "/assets/get-item.mp3",
  shield: "/assets/shield-dice.mp3",
  ricochet: "/assets/ricochet-dice.mp3",
  heal: "/assets/heal-dice.mp3",
  heal2: "/assets/heal-dice-2.wav",
  swap: "/assets/swap-dice.mp3",
  swap2: "/assets/swap-dice-2.mp3",
} as const;

export type SoundName = keyof typeof soundMap;

export type SfxController = {
  unlock: () => void;
  play: (name: SoundName) => void;
  playEvent: (event: GameEvent) => void;
  dispose: () => void;
};

const BGM_PATH = "/assets/game-music.mp3";
const CANNON_HIT_DELAY_MS = Math.floor(CANNON_RESOLVE_MS * 0.4);
const POWER_REVEAL_DELAY_MS = Math.floor(POWER_RESOLVE_MS * 0.6);
const POWER_SECONDARY_DELAY_MS = Math.floor(POWER_RESOLVE_MS * 0.8);

/** Maps only authoritative events to the sounds they require, without causing side effects. */
export function eventSoundNames(event: GameEvent): SoundName[] {
  if (event.type === "turnSkipped") return [];

  if (event.type === "cannon") {
    return [
      "rollCannon",
      ...(event.reflected ? (["ricochet"] as const) : []),
      ...(event.shielded ? (["shield"] as const) : []),
      "destroyTower",
    ];
  }

  switch (event.power) {
    case "shield":
    case "ricochet":
      return ["getItem"];
    case "heal":
      return ["heal", "heal2"];
    case "swap":
      return ["swap", "swap2"];
  }
}

function createAudio(source: string): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  try {
    return new Audio(source);
  } catch {
    return null;
  }
}

function safelyReset(audio: HTMLAudioElement) {
  try {
    audio.currentTime = 0;
  } catch {
    // Some browsers disallow seeking until enough media data is available.
  }
}

function safelyPause(audio: HTMLAudioElement) {
  try {
    audio.pause();
    safelyReset(audio);
  } catch {
    // Audio cleanup must never interrupt navigation or unmounting.
  }
}

function safelyPlay(audio: HTMLAudioElement) {
  safelyReset(audio);
  try {
    const playAttempt = audio.play();
    void Promise.resolve(playAttempt).catch(() => undefined);
  } catch {
    // Autoplay and device failures are non-fatal presentation concerns.
  }
}

/**
 * Creates an isolated controller for one mounted client. Audio and timers are retained only by
 * this closure so separate tabs/controllers cannot affect one another.
 */
export function createSfx(): SfxController {
  let disposed = false;
  let unlocked = false;
  let backgroundMusic: HTMLAudioElement | null = null;
  const templates = new Map<SoundName, HTMLAudioElement>();
  const activeSounds = new Set<HTMLAudioElement>();
  const delayedTimers = new Set<ReturnType<typeof setTimeout>>();

  const play = (name: SoundName) => {
    if (disposed) return;

    const template = templates.get(name) ?? createAudio(soundMap[name]);
    if (!template) return;
    templates.set(name, template);

    let instance: HTMLAudioElement | null = null;
    try {
      instance =
        typeof template.cloneNode === "function"
          ? (template.cloneNode(true) as HTMLAudioElement)
          : null;
    } catch {
      instance = null;
    }
    instance ??= createAudio(soundMap[name]);
    if (!instance) return;

    activeSounds.add(instance);
    instance.addEventListener("ended", () => activeSounds.delete(instance), { once: true });
    safelyPlay(instance);
  };

  const schedule = (delay: number, callback: () => void) => {
    const timer = setTimeout(() => {
      delayedTimers.delete(timer);
      if (!disposed) callback();
    }, delay);
    delayedTimers.add(timer);
  };

  const unlock = () => {
    if (disposed || unlocked) return;
    unlocked = true;
    backgroundMusic = createAudio(BGM_PATH);
    if (!backgroundMusic) return;
    backgroundMusic.loop = true;
    backgroundMusic.volume = 0.2;
    safelyPlay(backgroundMusic);
  };

  const playEvent = (event: GameEvent) => {
    if (disposed) return;

    if (event.type === "turnSkipped") return;

    if (event.type === "cannon") {
      play("rollCannon");
      schedule(CANNON_HIT_DELAY_MS, () => {
        if (event.reflected) play("ricochet");
        if (event.shielded) play("shield");
        play("destroyTower");
      });
      return;
    }

    const sounds = eventSoundNames(event);
    const [firstSound, secondSound] = sounds;
    if (firstSound) schedule(POWER_REVEAL_DELAY_MS, () => play(firstSound));
    if (secondSound) schedule(POWER_SECONDARY_DELAY_MS, () => play(secondSound));
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const timer of delayedTimers) clearTimeout(timer);
    delayedTimers.clear();
    if (backgroundMusic) safelyPause(backgroundMusic);
    for (const sound of activeSounds) safelyPause(sound);
    activeSounds.clear();
    templates.clear();
    backgroundMusic = null;
  };

  return { unlock, play, playEvent, dispose };
}
