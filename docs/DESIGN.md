# Dice Kingdom Clash Online: Multiplayer Design and Roadmap

**Status:** Design revision 3 (all open questions resolved). No implementation yet.

This document turns the original single-screen *Dice Kingdom Clash* ([repo](https://github.com/desmondtong/Game-Project-Dice-Kingdom-Clash), HTML/CSS/JS, two players sharing one screen) into a real-time, two-player networked game. The client is React (Vite + TypeScript) and the authoritative room server is PartyKit, both running locally on a laptop.

## 0. Decision log

| # | Topic | Decision |
|---|---|---|
| D1 | Tech stack | React + Vite + TypeScript client; PartyKit room server; local only (`partykit dev`), no account, no database |
| D2 | Accounts | None. Anonymous `playerId` (UUID) in sessionStorage plus a nickname |
| D3 | Joining | Home page has **Create Room** and **Join Room**; a short room code plus a copyable invite link (`/room/KX7P`) |
| D4 | Authority | The server owns all state, all dice rolls (cryptographic RNG) and all timers; clients send intents only |
| D5 | End after round 8 | **Higher HP wins**; tie only if HP is equal (the original always declared a tie) |
| D6 | Pause (Esc) | **Removed.** The original was designed for two people sharing one screen; in an online match, one player must not be able to pause the shared game |
| D7 | First player | Room creator goes first in match 1; the first player **alternates on each rematch**. A pick-a-card or dice-roll decider is listed under next iteration |
| D8 | Player agency | Keep the original luck-driven loop for the MVP; agency tweaks are listed under next iteration |
| D9 | Original code | Use it as a **rules reference only**. Do not copy-paste; rewrite as typed, state-driven, refactored modules (section 3) |
| D10 | Art, styling, sound | **Use the original assets and styling** (images, sounds, BGM, colours, ZCOOL KuaiLe font, layout) for the MVP; optimise later |
| D11 | Out of MVP | Network latency compensation, disconnect grace period and forfeit, persistence (section 10) |
| D12 | Heal amount | **Keep the original roll** `max(ceil(rand × 20), 10)`: 10 HP 50% of the time, 11–20 HP 5% each (average 12.75 HP) |
| D13 | Power step timeout | The server **auto-rolls** the Power Dice |
| D14 | Leave button | Clicking Leave during a match ends it at once and the **remaining player wins** (reason `left`). A disconnect or refresh is *not* a leave: the seat is held, and the grace-period forfeit is in the next iteration |

## 1. Game rules (canonical spec)

These rules are taken from the original `script.js` and written down precisely, so the server implementation does not depend on reading the old code. **(changed)** marks a deliberate difference from the original.

### 1.1 Setup
- Two players, seats 1 and 2. Each tower starts at **50 HP** (also the maximum).
- A match has **8 rounds**. In each round, each player takes one turn. The first player (D7) acts first in every round.

### 1.2 A turn
1. **Power step** (only in rounds **3** and **6**): the active player clicks the Power Dice deck. The server randomly picks one of four Power Dice (equal chance) and applies it immediately (1.3).
2. **Cannon step**: the active player clicks Roll. The server rolls two six-sided dice; **damage = die A × die B** (1 to 36). The attack is resolved as in 1.4.
3. **Timer**: each step has a **10-second** limit.
   - Cannon step timeout: the turn is **skipped** (no attack), as in the original.
   - Power step timeout **(changed)**: the server **auto-rolls** the Power Dice. In the original, the timer stopped during this step, so online a player could stall the match forever.

### 1.3 Power Dice
| Power | Effect | Lasts until |
|---|---|---|
| **Shield** | Your tower takes half damage (rounded up) from the next hit it receives | Consumed the next time your tower takes damage |
| **Ricochet** | Your opponent's next attack bounces back onto their own tower | Consumed when the opponent next fires (it remains if they time out) |
| **Heal** | Your tower regains HP, capped at 50 | Instant |
| **Swap** | The two towers swap HP. Shield and Ricochet stay with their original owners | Instant |

Heal amount (same as the original, D12): roll a whole number from 1 to 20 and raise it to at least 10, i.e. `max(ceil(rand × 20), 10)`. This gives 10 HP 50% of the time and 11–20 HP 5% each (average 12.75 HP). The result is still capped at 50 HP.

### 1.4 Resolving an attack (order matters)
1. **Target**: if the attacker is under Ricochet, the target is the attacker's own tower and Ricochet is consumed; otherwise the target is the opponent's tower.
2. **Shield**: if the target tower has Shield, damage = ceil(damage / 2) and Shield is consumed.
3. **Apply**: target HP = max(HP − damage, 0).
4. **Knockout**: if any tower reaches 0 HP, the match ends at once and that tower's owner loses. A player can lose to their own reflected attack.

### 1.5 End of match
- KO: the player whose tower is still standing wins (reason `ko`).
- After the second player's turn in round 8: **higher HP wins**; equal HP is a tie (reason `rounds`) **(changed)**.
- A player clicks Leave during the match: the match ends at once and the **remaining player wins** (reason `left`, D14). See section 6.

## 2. Architecture

The server is the only source of truth. Clients send **intents** (for example, "I want to roll my cannon"). They never send outcomes such as dice values, damage or HP. The server validates each intent, generates randomness with `crypto.getRandomValues`, applies the rules, and broadcasts the new state. Both screens render only that broadcast state.

```
 Browser A (React)                PartyKit room "KX7P"                Browser B (React)
 ─────────────────                ────────────────────                ─────────────────
 click "Roll"  ── intent ──────▶  validate seat/phase/step/turnId
                                  roll dice (server RNG)
                                  rules.applyCannon(...)
               ◀── event + state ─ broadcast version N ── event + state ──▶  animate + sound + render
```

### 2.1 Server state (one room = one PartyKit instance)

```ts
type Seat  = 1 | 2;
type Phase = "lobby" | "countdown" | "playing" | "finished";
type Step  = "power" | "cannon" | "resolving";
type Power = "shield" | "ricochet" | "heal" | "swap";

interface TowerState {
  hp: number;                 // 0..50
  shield: boolean;            // halve the next hit taken
  reflectNextAttack: boolean; // this seat's next attack bounces back (Ricochet placed by the opponent)
}

interface RoomState {
  code: string;
  created: boolean;           // false until an intent=create connection arrives
  phase: Phase;
  hostSeat: Seat;
  players: Partial<Record<Seat, { name: string; connected: boolean; ready: boolean }>>;
  match: {
    number: number;           // 1, 2, 3... (rematches)
    firstSeat: Seat;          // alternates each rematch (D7)
    round: number;            // 1..8
    currentSeat: Seat;
    step: Step;
    turnId: string;           // e.g. "m2-r3-s1-power"; rejects stale or duplicate intents
    turnDeadline: number;     // server epoch ms
    towers: Record<Seat, TowerState>;
    towerSeed: number;        // seeds the cosmetic dice faces so both screens match
  } | null;
  lastEvent: GameEvent | null;
  result: { winner: Seat | "tie"; reason: "ko" | "rounds" | "left" } | null;
  rematchVotes: Seat[];
  version: number;            // increments on every change
  serverNow: number;          // sent with every broadcast, for clock offset
}

type GameEvent =
  | { eventId: number; type: "cannon"; actor: Seat; dice: [number, number]; rawDamage: number;
      target: Seat; reflected: boolean; shielded: boolean; damage: number }
  | { eventId: number; type: "power"; actor: Seat; power: Power; healAmount?: number; auto: boolean }
  | { eventId: number; type: "turnSkipped"; actor: Seat };
```

Server-only data (never broadcast): the map `connectionId → { playerId, seat }`, and timer handles.

### 2.2 Message protocol

Identity and intent are sent **once, as connection query parameters**: `?playerId=…&name=…&intent=create|join`. They are never read from game messages.

Client to server (intents only):

| Message | Fields | Accepted only when |
|---|---|---|
| `ready` | `{}` | phase = lobby and both seats are filled |
| `rollPower` | `{ turnId }` | phase = playing, step = power, sender's seat = currentSeat, turnId matches |
| `rollCannon` | `{ turnId }` | phase = playing, step = cannon, sender's seat = currentSeat, turnId matches |
| `rematch` | `{}` | phase = finished, both players present |
| `leave` | `{}` | any time |

Server to client:

| Message | Purpose |
|---|---|
| `state` | Full `RoomState` snapshot |
| `event` | A `GameEvent` that triggers animation and sound on both clients |
| `error` | `{ code, message }` where `code` is one of `ROOM_NOT_FOUND`, `CODE_TAKEN`, `ROOM_FULL`, `GAME_IN_PROGRESS`, `NOT_YOUR_TURN`, `STALE_ACTION`, `INVALID_PHASE`, `REPLACED_BY_NEW_TAB` |

## 3. Refactoring the original code (rules reference only, D9)

The original code works for a shared screen, but its structure does not suit an authoritative online game. Each issue below has a replacement in the new design.

| Original pattern | Problem | New approach |
|---|---|---|
| Game state kept in the DOM: HP read back from `textContent`, Shield/Ricochet stored as CSS classes, the tower stored as an `innerHTML` string split on `"\n"` | The DOM is the database; this can't be sent over a network and is hard to validate | One typed `RoomState` object; the server owns it and React renders from it |
| 30+ `querySelector` handles and imperative `classList` toggling to enable/disable buttons | Hard to follow; UI and rules are mixed together | Declarative React components; whether a button is enabled is derived from state (e.g. `isMyTurn && step === "cannon"`) |
| Global mutable variables (`currPlayer`, `round`, `takeDamage`, `towerArr`…) and implicit globals (`a`, `b` in Swap) | Hidden coupling; accidental leaks onto `window` | No globals. Rules are **pure functions** in `shared/rules.ts`: `(state, rng) → { state, event }` |
| Keys built from strings, e.g. `` towers[`p${currPlayer}Tower`] `` repeated everywhere | Duplicate code; typos fail silently | `Record<Seat, …>` with an `opponent(seat)` helper; fully typed |
| A once-per-second `setInterval` that decrements the on-screen number and detects turn end by checking a button's `disabled` class | Timer logic depends on UI state; would drift between two clients | The server stores one `turnDeadline` and a single `setTimeout` per step. The client only *displays* the remaining time |
| `diceActionMsg` creates a new `setInterval` on every call and never clears it | Timer leak that piles up over a match | Toasts are React state with one cleanup-safe timeout |
| `Math.random()` in the browser for all rolls | Open to cheating online | Server-side `crypto.getRandomValues` with a small `rollDie()` helper |
| Each tower re-render generates new random dice faces | Faces flicker, and would differ between the two screens | Faces are seeded from `towerSeed` + seat + index, so they are stable and identical on both screens |
| Swap moves the tower `innerHTML` between players | Visual and data swapped together | Swap changes `hp` only; the tower view re-renders from HP |
| Heal roll written inline with `Math.random()` | Not testable; client-side | Same distribution (D12) in `rng.healAmount()` on the server's RNG, unit-tested |
| After round 8, always "IT'S A TIE!" | Ignores HP | Higher HP wins (D5) |
| Bootstrap JS modals opened manually | Imperative; conflicts with React | React modal components that reuse the Bootstrap CSS classes, so they look the same |
| `new Audio()` objects replayed while already playing | Overlapping plays get dropped | A small `sfx.play(name)` helper that resets or clones the sound; BGM starts after the first user click (browser autoplay rules) |

Delays such as the 2-second Power Dice reveal and the tower crumble animation become **server-side resolving windows** (section 4) plus **client-side CSS animations**, instead of chained `setTimeout`s that change the DOM.

## 4. Sync concerns (MVP)

| Concern | Design decision |
|---|---|
| **Authority** | The PartyKit room owns state, randomness and timers |
| **Game rules / win-lose** | Pure functions in `shared/rules.ts`, run only on the server; unit-testable without a network |
| **Cheating** | Clients can't choose dice values, damage, HP or power dice. Every intent is checked against phase, step, seat and `turnId`. The seat is bound to the connection, so a player cannot act as the opponent |
| **Duplicate actions** | The first intent matching the current `turnId` is accepted; the step then becomes `resolving` and `turnId` changes, so any repeat gets `STALE_ACTION`. The client also disables the button immediately after clicking |
| **Out-of-order / stale updates** | `state.version` increases on every change, and the client ignores snapshots that are not newer. `eventId` is recorded so an animation is never replayed after a reconnect |
| **Both sides seeing different results** | Clients render only the server snapshot; cosmetic tower faces are seeded (section 3) |
| **Animation pacing** | After every roll the server holds `step = "resolving"` for a fixed window (Power reveal about 2 s, Cannon about 1.5 s plus the crumble) so both clients animate together, then advances. Inputs during `resolving` are rejected |
| **Timer fairness** | The server enforces `turnDeadline`. Clients display `turnDeadline − (Date.now() + clockOffset)`, with `clockOffset` estimated from `serverNow`. Timeouts follow rule 1.2.3 |
| **Room not found** | `intent=join` on a room that was never created gets `ROOM_NOT_FOUND`, and the connection closes |
| **Code collision** | `intent=create` on a room that already exists gets `CODE_TAKEN`; the client retries with a new code. Codes are 4 characters from an alphabet without look-alikes (no 0/O, 1/I/L) |
| **Room full / joining mid-game** | A third distinct `playerId` gets `ROOM_FULL` (lobby) or `GAME_IN_PROGRESS` (match running) |
| **Reconnect identity** | `playerId` in sessionStorage (one per tab, survives refresh). The server re-attaches it to its existing seat and sends the current snapshot |
| **Same player in a second tab** | The newest connection takes over the seat; the old one gets `REPLACED_BY_NEW_TAB` and is closed |

## 5. Turn and room state machine

```
LOBBY ──(both ready)──▶ COUNTDOWN (3-2-1) ──▶ PLAYING ──(KO / round 8 done / player left)──▶ FINISHED
  ▲                                              │                                            │
  │                                              ▼                                            │
  │                           per turn:  [power]* → resolving → cannon → resolving            │
  │                           (* rounds 3 and 6 only; each step has a 10 s deadline)          │
  │                                                                                           │
  │◀──────── opponent leaves ───────────────────────────────────────────────────────────────── │
  └─────────────── both vote rematch → COUNTDOWN (match + 1, firstSeat alternates) ◀───────────┘
```

## 6. Room and player lifecycle (MVP)

| Situation | Behaviour |
|---|---|
| **Refresh** | Reconnect with the same `playerId` (sessionStorage) to the room code in the URL; receive the snapshot; the match continues |
| **Temporary disconnect** | `partysocket` reconnects automatically. The opponent sees "Opponent disconnected, reconnecting…". The turn timer keeps running, so an absent player loses turns to timeouts and cannot stall the match |
| **Leave button** | Sends `leave` and frees the seat. If a match was running, it ends at once and the **remaining player wins** (reason `left`, D14). The remaining player sees the result ("Opponent left, you win"), then returns to the lobby as host to invite someone new |
| **Joining mid-game** | Rejected with `GAME_IN_PROGRESS` and a friendly message |
| **Play again** | Both press Rematch (each player can see the other's vote). Towers reset to 50 HP, round 1, first seat alternates |
| **Host leaves the lobby** | The remaining player becomes host |

## 7. Screens, art and sound (original look, D10)

### 7.1 Screens (React)
1. **Home**: `start-menu.png` background and `name-logo.png`; nickname input; **Create Room**, **Join Room** (code input), **How To Play**.
2. **How To Play**: a modal rewritten from the original Tutorial content, with rule 1.2.3 and D5 updated.
3. **Lobby** (`/room/:code`): large room code, Copy invite link, two player cards (name, connected, ready), Ready button.
4. **Game**: the original layout: both towers made of dice faces with HP, `cannon.png` and the brown cannon dice equation (`A × B = ?`), the 8-round counter, the Power Dice deck (4 dice, with the chosen one highlighted), Shield/Ricochet status icons, the turn banner, the 10-second timer and the action message line. **Additions for online play**: a "You" marker on your own side, "Your turn" / "Opponent's turn" in the banner, an opponent connection dot, and a Leave button.
5. **Result**: the original result modal plus the reason (KO / rounds / opponent left), final HP, Rematch with the opponent's vote status (hidden when the opponent has left), and Back to Home.

Both players see the board from the same left/right layout (P1 left, P2 right), so it matches the original. "Your side" is highlighted.

### 7.2 Styling
- Port `style.css` as global CSS, keeping the colour variables (`--pastel-green/grey/yellow/blue/brown`), the **ZCOOL KuaiLe** Google Font, and the existing class names where practical.
- Keep **Bootstrap 5.3 CSS** for the original look; drop Bootstrap JS (React handles modals).

### 7.3 Assets
Copy everything from `Assets/` into `public/assets/`. Folders with spaces are renamed (`brown dice/` → `cannon-dice/`) to avoid URL encoding issues.

| Asset | Used for |
|---|---|
| `start-menu.png`, `name-logo.png` | Home background and title |
| `dice/dice-1..6.png` | Tower blocks (1 die = 1 HP) |
| `brown dice/1..6.png` | Cannon dice |
| `cannon.png` | Cannon graphic |
| `power-dice/{shield,ricochet,heal,swap}-dice.png` | Power deck and status icons |
| `game-music.mp3` | BGM (loop, volume 0.2, starts after first click) |
| `click2.mp3` | Button clicks |
| `roll-cannon.mp3` | Cannon roll (exists in the original but was unused) |
| `destroy-tower-short.mp3` | Tower takes damage |
| `get-item.mp3` | Shield or Ricochet obtained |
| `shield-dice.mp3`, `ricochet-dice.mp3` | Shield or Ricochet triggers |
| `heal-dice.mp3` + `heal-dice-2.wav` | Heal |
| `swap-dice.mp3` + `swap-dice-2.mp3` | Swap |
| `click.mp3`, `destroy-tower.mp3` | Unused for now (kept) |

Sounds are triggered by server `event` messages, so **both players hear the same thing at the same moment**, including the opponent's actions.

## 8. Project structure

```
dice-kingdom-clash-online/
  partykit.json
  party/
    server.ts            # room lifecycle, connection↔seat map, intent validation, timers, broadcast
  shared/
    types.ts             # RoomState, GameEvent, messages, error codes
    constants.ts         # MAX_HP=50, ROUNDS=8, POWER_ROUNDS=[3,6], STEP_MS=10000, resolve windows
    rules.ts             # pure: startMatch, applyPower, applyCannon, advanceTurn, checkResult
    rng.ts               # rollDie(), pickPower(), healAmount() on crypto.getRandomValues
  src/
    main.tsx  App.tsx    # router: / and /room/:code
    net/useRoom.ts       # partysocket, version/eventId filtering, clock offset, error handling
    net/identity.ts      # playerId (sessionStorage), nickname, room code generator
    pages/Home.tsx  Room.tsx
    components/          # HowToPlayModal, Lobby, GameBoard, Tower, CannonPanel,
                         # PowerDeck, StatusIcons, TurnBanner, Timer, ResultModal, Toast
    audio/sfx.ts         # sound map + BGM control
    styles/global.css    # ported from original style.css
  public/assets/         # original artwork and sounds
  tests/rules.test.ts    # unit tests for the rule engine (Vitest)
```

Local run: `npx partykit dev` (ws://localhost:1999) and `npm run dev` (http://localhost:5173). Test with two tabs, two browsers, or a second device on the same Wi-Fi.

## 9. Two-hour build plan

| Time | Work |
|---|---|
| 0:00 to 0:15 | Scaffold Vite + React + TS + PartyKit; copy and rename assets; port global CSS and font |
| 0:15 to 0:40 | `shared/`: types, constants, RNG, pure rules engine plus quick unit tests (attack order, Shield, Ricochet, Heal cap, Swap, KO, round-8 result) |
| 0:40 to 1:05 | `party/server.ts`: create/join/full/not-found, seat binding, reconnect, lobby/ready/countdown, turn loop with deadlines and resolving windows, rematch, leave |
| 1:05 to 1:40 | Client: Home, How To Play, Lobby, Game board, Result; state rendering, event-driven animations and sounds |
| 1:40 to 2:00 | Two-tab test pass: refresh mid-turn, double-click, out-of-turn click, third player, leave, rematch; polish |

## 10. Next iteration / good-to-have

- **Network latency handling**: an instant local "rolling…" animation on click before the server replies; a ping indicator.
- **Disconnect grace period and forfeit**: a timer starts when a player disconnects (e.g. 30 s) and is cancelled if they reconnect; when it expires, the connected player wins (reason `forfeit`). Covers closed laptops and lost Wi-Fi; a refresh reconnects well within the grace period.
- **Persistence**: room state in `room.storage` so it survives a server restart; room expiry and cleanup.
- **Decide who goes first** with a mini-game (pick a card or a dice-roll-off) instead of D7.
- **More player agency**: e.g. hold a Power Dice and choose when to use it, or one re-roll per match.
- **Spectators** joining mid-game in read-only mode.
- **Art, animation and sound polish**: dice tumble, tower crumble, screen shake on big hits, damage pop-ups, BGM/SFX mute toggle, responsive layout.
- Emotes or quick reactions between players.

## 11. Open questions

None. Q1 to Q3 have been resolved as D12 to D14.
