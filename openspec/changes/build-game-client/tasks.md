# Implementation Tasks: Build Game Client

**Change ID:** `build-game-client`
**Decisions:** C-DEC-1 to C-DEC-7, all confirmed as option (a) (see `proposal.md`)
**Worktree:** `../dice-kingdom-clash-online-worktrees/build-game-client` on `feature/build-game-client`
**Writes only:** `src/**`, `public/**`, `tests/client/**`, this change's folder
**Dev port:** 5173 only (Vite, mocks); never start PartyKit

---

## Phase 0: Set up the track

- [ ] 0.1 From the main checkout: `git worktree add ../dice-kingdom-clash-online-worktrees/build-game-client -b feature/build-game-client main` (skip if the coordinator already created it)
- [ ] 0.2 In the worktree: `npm ci`, then run all five quality gates to confirm a clean start
- [ ] 0.3 Read `openspec/project.md`, `openspec/specs/realtime-sync.md`, `docs/DESIGN.md` sections 3, 4 and 7, and `shared/fixtures/index.ts`
- [ ] 0.4 Read the original `index.html`, `style.css` and Tutorial text from the original repository (reference only, D9)

---

## Phase 1: Networking core (no UI)

- [ ] 1.1 `src/net/identity.ts`: `getPlayerId()` (sessionStorage, `crypto.randomUUID()`), nickname load/save (C-DEC-3), joined-rooms set in sessionStorage, `generateRoomCode()` from `ROOM_CODE_ALPHABET` / `ROOM_CODE_LENGTH` (uses `crypto.getRandomValues`, not `Math.random`)
- [ ] 1.2 `src/net/roomStore.ts`: pure reducer for `welcome`, `state`, `error`, connection status; version filter; `pendingEvent` only for a new `eventId`; `markEventPlayed`; clock offset; fatal vs non-fatal (`isFatalError`)
- [ ] 1.3 `src/net/connection.ts`: `RoomConnection` interface; real PartySocket implementation (X1, X2, X4, X5: stop reconnecting on fatal error and on leave)
- [ ] 1.4 `src/net/mock/`: mock connection over the fixtures (C-DEC-1): static fixture mode and the `demo` script; dev only
- [ ] 1.5 `src/net/useRoom.ts`: hook combining the above; create flow with `CODE_TAKEN` retry (X3)
- [ ] 1.6 Tests: `tests/client/net/identity.test.ts`, `roomStore.test.ts` (every reducer rule), `connection.test.ts` (real implementation with a fake PartySocket: query parameters, stop on fatal, leave closes)

**Quality Gate:** typecheck, lint, tests

---

## Phase 2: Styling, routing and Home

- [ ] 2.1 `src/styles/global.css`: port the original `style.css` (colour variables, font, class names where practical)
- [ ] 2.2 `src/App.tsx` with `react-router`: `/`, `/room/:code`, and dev-only `/dev/fixtures`; replace the scaffold placeholder and its test
- [ ] 2.3 `src/pages/Home.tsx`: background and logo, nickname input (`limitNameInput`), Create Room, Join Room (code input, upper-cased, alphabet-checked), How To Play
- [ ] 2.4 `src/components/HowToPlayModal.tsx`: Tutorial rewritten with rule 1.2.3 (timeouts) and D5 (higher HP wins)
- [ ] 2.5 Tests: Home (name limit with emoji, code input validation, buttons), How To Play opens and closes

**Quality Gate:** typecheck, lint, tests

---

## Phase 3: Room, Lobby and Game screens

- [ ] 3.1 `src/pages/Room.tsx`: join card for direct visits (C-DEC-2), then Lobby / Game / Result by `phase`; own-connection banner (C-DEC-5); friendly error screen for fatal errors with Back to Home (X4)
- [ ] 3.2 `Lobby`: room code, Copy invite link, two player cards (name, connected, ready), Ready button, Leave
- [ ] 3.3 `GameBoard`, `Tower` (1 die = 1 HP, seeded faces), `CannonPanel` (`A × B = ?`), `PowerDeck`, `StatusIcons`, `TurnBanner` ("Your turn" / "Opponent's turn"), `Timer`, `CountdownOverlay`, `Toast` (action messages from `lastEvent`), "You" marker, opponent connection dot, Leave with confirmation (C-DEC-4)
- [ ] 3.4 Tests: every fixture renders for seat 1 and seat 2; button enablement rules from the success criteria; timer from `turnDeadline` and offset; the turnSkipped toast

**Quality Gate:** typecheck, lint, tests

---

## Phase 4: Result, animations and sound

- [ ] 4.1 `ResultModal`: winner or tie, reason (KO / rounds / opponent left), final HP, Rematch with the opponent's vote, Rematch hidden when the opponent left (X6), Back to Home
- [ ] 4.2 Animations (C-DEC-6) driven by `pendingEvent`, sized from `POWER_RESOLVE_MS` and `CANNON_RESOLVE_MS`; HP changes when the hit lands
- [ ] 4.3 `src/audio/sfx.ts`: sound map (DESIGN.md 7.3), safe replay, BGM after the first click; sounds triggered from `pendingEvent`
- [ ] 4.4 Tests: Result for every finished fixture; an event animates once and not again after a repeated snapshot; the right sound name is requested per event (audio mocked)
- [ ] 4.5 Manual check in the browser with `?mock=demo` for seat 1 and seat 2, and every fixture in `/dev/fixtures`; compare with the original look

**Quality Gate:** all five gates

---

## Phase 5: Docs and completion

- [ ] 5.1 Confirm no frozen or server-owned file changed (see the success criteria command), and no `Math.random` in `src/**`
- [ ] 5.2 Sync the delta spec with what was built; record deviations and findings in Implementation Notes
- [ ] 5.3 Rebase onto `main` (after the server track is merged, if it already is), run all five gates, push `feature/build-game-client`
- [ ] 5.4 Report to the coordinator for review and archive (client is merged after the server)

**Quality Gate (final):** `npm run typecheck`, `npm run lint`, `npm test`, `npm run format:check`, `npm run build`
