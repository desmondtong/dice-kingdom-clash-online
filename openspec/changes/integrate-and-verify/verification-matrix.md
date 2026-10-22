# Verification Matrix: Integrate and Verify

**Change ID:** `integrate-and-verify`
**Status:** Draft (finalise after both parallel tracks are archived)

How to read this: **P1** is the player who creates the room (seat 1), **P2** joins (seat 2). Unless stated otherwise, P2 is a fresh tab with the invite link pasted in, or a private window. "Both" means the check is made on both screens. **Source** points to the spec or agreement the row verifies:

| Source | Means |
|---|---|
| RS | `openspec/specs/realtime-sync.md` |
| GR | `game-rules` spec (from `build-game-server`) |
| RL | `room-lifecycle` spec (from `build-game-server`) |
| UI | `game-ui` spec (from `build-game-client`) |
| X1 to X8 | Cross-track agreements in both parallel proposals |
| D… | Decision in `docs/DESIGN.md` 0 |

**Method:** **B** = two browser tabs; **C** = forged message from the browser console; **S** = the Node smoke script from `build-game-server`; **U** = existing unit tests (the row is only re-confirmed, not re-tested by hand).

---

## A. Getting into a game

| ID | Scenario | Expected result | Source | Method |
|---|---|---|---|---|
| A1 | P1 enters a name and clicks Create Room | `/room/{code}` with a 4-character code, P1 in seat 1 as host | UI, RL, D3 | B |
| A2 | P1 copies the invite link; P2 opens it in a fresh tab | "Join room C" card with the name input; after Join, both see two player cards | UI (C-DEC-2), RL | B |
| A3 | P2 joins from Home by typing the code in lower case | Code upper-cased, join succeeds | UI | B |
| A4 | P2 enters a code that was never created | Friendly "room not found" message, Back to Home, no reconnect loop | RS, X4 | B |
| A5 | A third fresh tab joins a full lobby | "Room is full" message, connection closed | RL, X4 | B |
| A6 | A third fresh tab joins while a match is running, and after it finished | "Game in progress" message in both cases (D19) | RL | B |
| A7 | Create Room hits an existing code | Client retries with a new code (X3) | X3 | U + S |
| A8 | Name of 15 characters with emoji typed and pasted | Input keeps 12 characters, emoji counted as one; the opponent sees the same name | RS, UI | B |
| A9 | A connection with a too-long or blank `name`, or a bad `playerId` / `intent` | Name sanitised (blank becomes "Player N"); bad parameters get `INVALID_MESSAGE` and close | RS | S or C |
| A10 | Nickname remembered | Opening Home again pre-fills the last name (C-DEC-3) | UI | B |

## B. Lobby and start

| ID | Scenario | Expected result | Source | Method |
|---|---|---|---|---|
| B1 | Both in the lobby | Both see both names, connected dots, ready states | UI | B |
| B2 | P1 alone clicks Ready | Ready disabled (or `INVALID_PHASE` if forced from the console) | RL, UI | B + C |
| B3 | P1 clicks Ready, then P2 | P2 sees P1 ready at once; after P2, the 3-2-1 countdown starts on both at the same moment | RL, RS | B |
| B4 | P1 clicks Ready twice (console) | No change, no error | RL (S-DEC-4) | C |
| B5 | Host (P1) leaves the lobby | P2 becomes host; ready flags reset | RL | B |
| B6 | A player leaves during the countdown | Countdown cancelled; the other is back in the lobby as host, no result (S-DEC-1) | RL | B |

## C. Playing

| ID | Scenario | Expected result | Source | Method |
|---|---|---|---|---|
| C1 | Match starts | Both: P1 left, P2 right, "You" on own side, banner "Your turn" for P1 and "Opponent's turn" for P2 | UI, D7 | B |
| C2 | P1 rolls the cannon | Both see the same dice, `A × B`, damage, target, HP; animation and sound play once on both | RS, GR, UI, X8 | B |
| C3 | Roll is enabled only for the active player in the Cannon step | Opponent's Roll and deck disabled | UI | B |
| C4 | Opponent forges `rollCannon` from the console | `NOT_YOUR_TURN`, nothing changes | RS | C |
| C5 | Active player double-clicks Roll, or sends the same `turnId` twice from the console | One roll; the repeat gets `STALE_ACTION` | RS | B + C |
| C6 | Console sends `rollCannon` with extra fields (`dice`, `damage`, `hp`) | Extra fields ignored; outcome from the server only | RS, D4 | C |
| C7 | Console sends invalid JSON, an unknown type, a 2 KB message | `INVALID_MESSAGE`, connection stays open, state unchanged | RS | C |
| C8 | Clicks during `resolving` | `INVALID_PHASE` (buttons are disabled anyway) | RS | C |
| C9 | Rounds 3 and 6 | Power step first; the deck animates and highlights the chosen die on both | GR, UI | B |
| C10 | Shield, Ricochet, Heal, Swap each seen at least once | Both screens show the same effect, status icon, HP and sound; exact maths already in unit tests | GR, UI | B + U |
| C11 | Power step times out | Server auto-rolls (`auto: true`); both see it | GR, D13 | B |
| C12 | Cannon step times out | "Turn skipped" on both; next turn starts at once (no window); Ricochet kept | GR, RS | B |
| C13 | Timer on both tabs | Same remaining time within 0.5 s; never below 0 | RS, UI | B |
| C14 | Animations fit the windows | Power reveal ends before the next step; cannon roll and crumble end before the next turn; HP changes when the hit lands | UI (C-DEC-6), X8 | B |
| C15 | Knockout (including a self-KO by Ricochet if it occurs) | Final hit animates on both, then the result: winner, reason KO | GR, RS | B (+ U) |
| C16 | After round 8 | Higher HP wins, reason rounds; equal HP is a tie (D5) | GR | B (+ U) |
| C17 | Round counter and turn order over a full match | 8 rounds, first seat first each round | GR | B |

## D. Room and player lifecycle

| ID | Scenario | Expected result | Source | Method |
|---|---|---|---|---|
| D1 | The active player refreshes mid-turn | Same seat, same state, timer continues; the last animation does not replay | RS, RL, X2 | B |
| D2 | The waiting player refreshes | Same as D1; the opponent sees the connection dot go off and back on | RL, UI | B |
| D3 | P1 opens the same room in a duplicated tab (same `playerId`) | The new tab takes over; the old tab shows "opened in another tab", stops reconnecting | RL, X2, X4 | B |
| D4 | P2 closes the tab mid-match | P1 sees "Opponent disconnected, reconnecting…"; P2's steps time out (auto-roll / skip); match continues | RL (S-DEC-5), UI | B |
| D5 | P2 reopens the room link after D4 | P2 back in the same seat with the current state | RL, X2 | B |
| D6 | Own connection lost (stop the PartyKit server) | Both show "Connection lost, reconnecting…", actions disabled | UI (C-DEC-5) | B |
| D7 | Server restarted after D6 | Room is gone (memory only, S-DEC-6): both get "room not found" with Back to Home | RL, X4 | B |
| D8 | P2 clicks Leave mid-match | Confirmation first; after confirm, P2 goes Home; P1 sees "Opponent left, you win", Back to Home only, no Rematch | RL, UI, D14, D19, X5, X6 | B |
| D9 | Leave after a finished match | The other sees Rematch hidden, Back to Home only | RL, X6 | B |
| D10 | Both leave | Room discarded; the code can be created again (S-DEC-2) | RL | S |
| D11 | Idle room lifetime | Matches the S-DEC-6 measurement recorded by `build-game-server` | RL | B |

## E. Playing again

| ID | Scenario | Expected result | Source | Method |
|---|---|---|---|---|
| E1 | P1 clicks Rematch | P1 sees "Waiting for opponent"; P2 sees P1's vote | RL, UI, X7 | B |
| E2 | P2 clicks Rematch | Countdown on both; match 2 starts with P2 first, 50 HP each, round 1, no statuses | RL, D7, X7 | B |
| E3 | Several matches in a row | Snapshots and animations keep working (versions and event IDs only increase) | RS | B |

## F. Look, sound and feel

| ID | Scenario | Expected result | Source | Method |
|---|---|---|---|---|
| F1 | Every screen next to the original game | Same artwork, colours, font and layout (D10, C-DEC-7) | UI | B |
| F2 | Sounds | BGM after the first click; each event's sound on both tabs, the opponent's actions included | UI, DESIGN.md 7.3 | B |
| F3 | How To Play | Opens from Home, rules match DESIGN.md 1 (timeouts, higher HP wins) | UI | B |
| F4 | Every error code | Friendly text; fatal ones offer Back to Home | RS, UI | B + C |

## G. Build and handover

| ID | Scenario | Expected result | Source | Method |
|---|---|---|---|---|
| G1 | All five quality gates | Pass | project-setup | U |
| G2 | Server smoke script against `npm run dev:server` | Full match, rematch, leave: exits 0 | RL | S |
| G3 | Production build | No `?mock=` handling and no `/dev/fixtures` route | UI | U + B |
| G4 | Fresh clone of the GitHub repo | `npm ci` and `npm run dev` work by following the README (public registry) | project-setup | B |

---

## Brief coverage

| Original brief asks for | Rows |
|---|---|
| Two players enter the same match | A1 to A3, B1 to B3 |
| See each other's actions | C1, C2, C9, C10, E1 |
| Join, start, play, finish, play again | A, B, C15 to C17, E |
| Truly networked, not two local screens | C2, C13, C14, D1 to D7 |
| Create or join a room, invite, no account | A1 to A3, A10 |
| Clear rules, controls, win and lose | C3, C15, C16, F3 |
| Visuals, animation, sound, pacing | C14, F1, F2 |
| Authority, latency, duplicates, out-of-order, cheating, divergence | C4 to C8, C13, D1, E3 |
| Refresh, disconnect, reconnect, leave, join mid-game, restart | A6, D1 to D10, E2 |
