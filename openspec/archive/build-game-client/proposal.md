# Proposal: Build Game Client

**Change ID:** `build-game-client`
**Created:** 2026-10-22
**Status:** Implementation Complete (approved decisions C-DEC-1 to C-DEC-7 retained)
**Completed:** 2026-10-22
**Track:** parallel, client (runs alongside `build-game-server`; see DESIGN.md 9)

---

## Problem Statement

The contracts are frozen (`openspec/specs/realtime-sync.md`, `shared/`), but the browser shows only the scaffold placeholder (`src/App.tsx`). Players have no way to create or join a room, see the board, roll, watch animations, hear sounds, or play again.

The real server is being built at the same time, so the client must be built and tested **without it**, against the fixtures in `shared/fixtures/` and a mock connection with the same interface as the real one. `integrate-and-verify` then swaps the mock for the real server.

## Proposed Solution

A React client that renders **only** what the server sends, in the original look (D10).

| Layer | Files | Responsibility |
|---|---|---|
| Identity | `src/net/identity.ts` | `playerId` (UUID in sessionStorage, one per tab), nickname (C-DEC-3), rooms this tab has joined, room code generator (`ROOM_CODE_ALPHABET`) |
| Room store | `src/net/roomStore.ts` | A **pure reducer** for incoming `ServerMessage`s: seat from `welcome`, ignore snapshots whose `version` is not newer, queue a `lastEvent` only if its `eventId` is new, clock offset from `serverNow`, connection status, fatal vs non-fatal errors |
| Connection | `src/net/connection.ts` | A `RoomConnection` interface (`send(intent)`, `close()`, message and status callbacks) with two implementations: **real** (PartySocket, used in `integrate-and-verify`) and **mock** (fixtures, C-DEC-1) |
| Hook | `src/net/useRoom.ts` | Connects, feeds the reducer, exposes `{ state, seat, status, error, pendingEvent, send }` |
| Pages | `src/pages/Home.tsx`, `src/pages/Room.tsx` | Routing with `react-router` (installed v8): `/` and `/room/:code`. `Room` picks Lobby, Game or Result from `state.phase` |
| Components | `src/components/**` | HowToPlayModal, Lobby, GameBoard, Tower, CannonPanel, PowerDeck, StatusIcons, TurnBanner, Timer, CountdownOverlay, ResultModal, Toast, ConfirmLeave |
| Sound | `src/audio/sfx.ts` | Sound map from DESIGN.md 7.3, safe replay (clone or reset), BGM after the first click |
| Styling | `src/styles/global.css` | The original `style.css`, ported (colour variables, ZCOOL KuaiLe, class names where practical) |

Rules for every component: buttons are enabled only from state (for example Roll = `isMyTurn && step === "cannon"`), and a clicked button disables itself until a newer snapshot arrives. The client never computes dice, damage, HP or results. The only client-side randomness is the cosmetic tower faces, seeded from `towerSeed` + seat + index so both screens match.

The original `index.html`, `style.css` and Tutorial text are read from the original repository ([Game-Project-Dice-Kingdom-Clash](https://github.com/desmondtong/Game-Project-Dice-Kingdom-Clash)) as a reference (D9): the CSS is ported and adapted, the Tutorial text is rewritten with rule 1.2.3 and D5 updated.

## Scope

### In Scope
- All five screens in DESIGN.md 7.1 (Home, How To Play, Lobby, Game, Result) with the online additions ("You" marker, turn banner, opponent connection dot, Leave).
- Countdown overlay (`countdownEndsAt`), turn timer from `turnDeadline` and the clock offset, action messages from `lastEvent`.
- Animations sized to the resolving windows: Power reveal within `POWER_RESOLVE_MS`, cannon dice roll and tower crumble within `CANNON_RESOLVE_MS`.
- Sounds for every event, heard by both players (DESIGN.md 7.3).
- Nickname input limited with `limitNameInput` (`NAME_MAX_LENGTH`).
- Friendly text for all 9 error codes; fatal errors stop reconnecting.
- Mock connection and dev-only fixture gallery (C-DEC-1).
- The real PartySocket connection written to the cross-track agreements, but **not run against a real server** in this change.
- Tests in `tests/client/**`; the scaffold placeholder `App.tsx` and its test are replaced.
- Delta spec: `game-ui.md` (new).

### Out of Scope
- Anything in `party/**`, `shared/**`, `tests/rules/**`, `tests/server/**`, `tests/contracts/**`, configs, `package.json` (frozen or server-owned). A needed change is a blocker (DESIGN.md 9.2).
- Running against the real server (that is `integrate-and-verify`).
- Next iteration (DESIGN.md 10): instant local "rolling…" feedback, ping indicator, mute toggle, responsive or mobile layout, emotes, polish beyond the original look.

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| UI (`src/**`) | Yes | All screens, components, styles |
| Client networking | Yes | Reducer, connection interface, real and mock implementations, hook |
| Assets (`public/**`) | Maybe | Only if an asset needs a fix; the originals are used as-is |
| Protocol / types | No | Frozen; used as-is |
| Server | No | Server track |
| Tests | Yes | `tests/client/**` |

## Architecture Considerations

- **Why a pure reducer:** the tricky parts of the client (ignoring old snapshots, never replaying an animation, clock offset, fatal errors) are pure functions of "current client state + message". Testing them as a reducer is fast and does not need a socket or React.
- **Why a connection interface:** the mock and the real socket have the same shape, so `integrate-and-verify` changes one line (which implementation `useRoom` gets), not the components.
- **Animations are driven by `pendingEvent`,** which the reducer sets only for a new `eventId`. After an animation the component marks it played. On reconnect, an already played `eventId` is not queued again.
- **Clock offset:** `offset = serverNow − Date.now()` from the latest snapshot; the timer shows `turnDeadline − (Date.now() + offset)`, clamped at 0. Only the server decides timeouts.

## Cross-track Agreements (identical in both parallel proposals)

These are behaviours the contracts imply but do not spell out. Both tracks build to them; they are reviewed together.

| # | Situation | Server does | Client does |
|---|---|---|---|
| X1 | Connecting | Accepts PartySocket connections on party `main`, room id = room code, query `playerId`, `name`, `intent` | Connects to `localhost:1999`, party `main`, room = code, with those three query parameters |
| X2 | Known `playerId` | Treats it as a reconnect to its seat **whatever the `intent`**, keeps the original name, sends `welcome` + `state`; an older connection for that seat gets `REPLACED_BY_NEW_TAB` and is closed | On refresh or reconnect, always uses `intent=join` for a room it is already in |
| X3 | Create | `intent=create` on an existing room gets `CODE_TAKEN` (fatal) | Generates a new code and retries, up to 5 times, then shows an error |
| X4 | Fatal error | Sends `error`, then closes the connection | Stops PartySocket from reconnecting, shows a friendly message, offers Back to Home |
| X5 | Leave | Frees the seat (S-DEC-1/2), broadcasts the new state to the others, then closes the leaver's connection | Sends `leave`, closes its own socket without reconnecting, forgets the room in sessionStorage, goes to Home |
| X6 | After opponent left (D19) | `rematch` gets `INVALID_PHASE` | Hides Rematch; shows Back to Home only |
| X7 | Rematch | Both votes → `countdown` for match + 1 with `firstSeat` alternated; votes and ready flags reset | Shows the opponent's vote; the countdown overlay reuses the lobby countdown |
| X8 | Animations | Holds `resolving` for `POWER_RESOLVE_MS` / `CANNON_RESOLVE_MS` | Fits each animation inside its window; animates only on a new `lastEvent.eventId` |

## Decisions (confirmed 2026-10-22)

**C-DEC-1: How to develop without the server.**
- **(a) Recommended, confirmed:** in dev builds only, `?mock=<fixtureName>&seat=1|2` on `/room/:code` renders that fixture as the given seat. `?mock=demo` plays a scripted match: the mock steps through the fixtures on a timer and answers clicks by moving to the next matching fixture, so animations and sounds can be checked end to end. A dev-only `/dev/fixtures` page lists every fixture with links for seat 1 and seat 2. None of this is reachable in a production build.
- (b) Only the static `?mock=<fixtureName>` (no demo script).

**C-DEC-2: Visiting an invite link directly.**
- **(a) Recommended, confirmed:** if this tab has not joined room C yet, `/room/C` shows a small "Join room C" card with the nickname input; it connects with `intent=join` after the click. If the tab has joined C before (sessionStorage), it connects at once (refresh case, X2).

**C-DEC-3: Where the nickname is stored.**
- **(a) Recommended, confirmed:** `localStorage`, so it is filled in next time. `playerId` stays in `sessionStorage` (one per tab), which is what makes two-tab testing work.
- (b) `sessionStorage` for both (the name has to be typed in every new tab).

**C-DEC-4: Leave confirmation during a match.**
- **(a) Recommended, confirmed:** clicking Leave in `playing` asks "Leave the match? Your opponent wins." with Leave and Stay. In `lobby` and `finished` Leave acts at once.
- (b) No confirmation.

**C-DEC-5: The player's own connection drops.**
- **(a) Recommended, confirmed:** a banner "Connection lost, reconnecting…" over the board, with the actions disabled, until a new snapshot arrives. The opponent's status uses the connection dot and the message "Opponent disconnected, reconnecting…".

**C-DEC-6: Animation timing inside the windows.**
- **(a) Recommended, confirmed:** Power reveal: deck shuffle about 1.2 s, then the chosen die is highlighted for the rest of `POWER_RESOLVE_MS` (2 s). Cannon: dice tumble about 1.0 s, then the equation and the hit, then the tower crumble about 1.0 s, all within `CANNON_RESOLVE_MS` (2.5 s). HP numbers change when the hit lands, not when the snapshot arrives.

**C-DEC-7: Original layout fidelity.**
- **(a) Recommended, confirmed:** match the original desktop layout (towers left and right, cannon in the middle, power deck, round counter) using the ported CSS, at a fixed minimum width; no responsive layout in the MVP (next iteration). Where the original used Bootstrap JS modals, use React modals with the same Bootstrap classes.

## Success Criteria

- [x] Every fixture in `shared/fixtures/` renders the correct screen for both seats without errors (one test per fixture and seat).
- [x] Buttons are enabled only when allowed: Ready (lobby, both seats, not yet ready), Power deck (my turn, step `power`), Roll (my turn, step `cannon`), Rematch (finished, opponent present, not yet voted); disabled while `resolving` and after a click until a newer snapshot.
- [x] Reducer tests: stale `version` ignored, `lastEvent` animated once and not replayed after reconnect, clock offset applied, fatal errors stop reconnecting, non-fatal errors keep the latest state.
- [x] The nickname input never holds more than 12 characters, emoji included.
- [x] Every error code has a friendly message.
- [x] `?mock=demo` plays from countdown through a full match to the result screen with animations and sounds, and Rematch starts the next match.
- [x] No outcome logic on the client: no `Math.random` in `src/**`, and no dice, damage or HP is computed client-side.
- [x] No frozen or server-owned file changed (`git diff main --stat -- shared party tests/contracts tests/rules tests/server package.json package-lock.json *.config.* tsconfig*.json partykit.json` is empty).
- [x] All five quality gates pass.

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| The real server behaves differently from the fixtures | Med | Med | Both tracks build to the same contracts and the X1 to X8 agreements; differences are fixed in `integrate-and-verify` |
| The original CSS conflicts with React structure or Bootstrap 5.3 | Med | Low | Port selectively, keep class names where practical, check each screen against the original |
| Browsers block audio before a user click | High | Low | BGM and sounds start after the first click (DESIGN.md 3); the first click is on Home |
| Animations overrun the resolving windows | Med | Med | C-DEC-6 timings with margin; durations come from the constants, not hard-coded |
| Mock code leaks into production | Low | Low | Guarded by `import.meta.env.DEV`; a test checks the production router has no mock routes |

---

## Archive Information

**Archived:** 2026-10-22 17:23
**Duration:** same day (proposal created and archived on 2026-10-22)
**Outcome:** Successfully implemented; merged into `main` in a parallel track

### Changes after approval

- Integration fix on `main` (`b98b522`): the client now uses the real room server by default; the mock is used only with `?mock=`. The App test's socket mock became an inert fake.
- Feature added on `main` (`19fde85`): Music on/off toggle (BGM only, remembered, synced across tabs). Recorded as the "Music toggle" requirement in `game-ui.md`.

### Files Added or Modified

- `src/App.tsx`
- `src/audio/sfx.ts`
- `src/components/CannonPanel.tsx`
- `src/components/ConfirmLeave.tsx`
- `src/components/CountdownOverlay.tsx`
- `src/components/ErrorToast.tsx`
- `src/components/GameBoard.tsx`
- `src/components/HowToPlayModal.tsx`
- `src/components/Lobby.tsx`
- `src/components/Modal.tsx`
- `src/components/PowerDeck.tsx`
- `src/components/ResultModal.tsx`
- `src/components/StatusIcons.tsx`
- `src/components/Timer.tsx`
- `src/components/Toast.tsx`
- `src/components/Tower.tsx`
- `src/components/TurnBanner.tsx`
- `src/net/connection.ts`
- `src/net/identity.ts`
- `src/net/mock/mockConnection.ts`
- `src/net/roomStore.ts`
- `src/net/useRoom.ts`
- `src/pages/FixtureGallery.tsx`
- `src/pages/Home.tsx`
- `src/pages/Room.tsx`
- `src/styles/global.css`
- `tests/client/App.test.tsx`
- `tests/client/board/GameBoard.test.tsx`
- `tests/client/board/integration.test.tsx`
- `tests/client/net/connection.test.ts`
- `tests/client/net/identity.test.ts`
- `tests/client/net/mockConnection.test.ts`
- `tests/client/net/roomStore.test.ts`
- `tests/client/net/useRoom.test.ts`
- `tests/client/presentation/Lobby.test.tsx`
- `tests/client/presentation/Modals.test.tsx`
- `tests/client/presentation/ResultModal.test.tsx`
- `tests/client/presentation/sfx.test.ts`

### Specs Updated

- `openspec/specs/game-ui.md` (new)
