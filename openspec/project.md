# Project Context

## Overview

**Dice Kingdom Clash Online** is a real-time, two-player, turn-based browser game. It turns the original single-screen *Dice Kingdom Clash* ([original repo](https://github.com/desmondtong/Game-Project-Dice-Kingdom-Clash)) into a networked game: two players create or join a room with a short code, take turns rolling Cannon Dice and Power Dice to destroy each other's dice tower, and can rematch in the same room.

The full design, decision log and roadmap are in [`docs/DESIGN.md`](../docs/DESIGN.md). That document is the planning reference. **`openspec/specs/` becomes the source of truth** as changes are archived.

The project is a local demo: it runs entirely on one laptop. It has no accounts, no database and no cloud deployment.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Client framework | React + Vite + TypeScript |
| Realtime / authoritative server | PartyKit (local `partykit dev`), one room instance per room code |
| Client networking | `partysocket` (WebSocket with auto-reconnect) |
| State management | Server-owned `RoomState`; the client renders server snapshots (React state/hooks only, no client state library) |
| Database | None. Room state is in memory (persistence is a later iteration) |
| Identity | Anonymous `playerId` (UUID) in `sessionStorage` plus a nickname; no accounts |
| Styling | Original `style.css` ported as global CSS, Bootstrap 5.3 CSS (no Bootstrap JS), ZCOOL KuaiLe font |
| Testing | Vitest (unit tests for the rules engine and server logic) |
| Package manager | npm |

## Architecture

The server is authoritative. Clients send **intents** only (`ready`, `rollPower`, `rollCannon`, `rematch`, `leave`). The server validates each intent against phase, step, seat and `turnId`; it generates all randomness with `crypto.getRandomValues`, applies the rules, runs all timers, and broadcasts versioned `state` snapshots plus `event` messages for animation and sound.

Planned structure (it is created by the first change proposal and does not exist yet):

```
party/server.ts        # PartyKit room: lifecycle, connection↔seat binding, validation, timers, broadcast
shared/types.ts        # RoomState, GameEvent, messages, error codes
shared/constants.ts    # MAX_HP, ROUNDS, POWER_ROUNDS, STEP_MS, resolve windows
shared/rules.ts        # pure rule functions: (state, rng) → { state, event }
shared/rng.ts          # crypto-based dice helpers
src/                   # React app: pages/, components/, net/, audio/, styles/
public/assets/         # original artwork and sounds
tests/                 # Vitest tests
```

## Coding Conventions

### Naming
- Files: React components `PascalCase.tsx`; other modules `camelCase.ts`
- Components, types and interfaces: `PascalCase`
- Variables and functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Message types and error codes: message `type` values in `camelCase` (e.g. `rollCannon`); error codes in `UPPER_SNAKE_CASE` (e.g. `ROOM_FULL`)
- Feature / change IDs: `kebab-case`

### Rules of the codebase
- **The original code is a rules reference only.** Do not copy and paste it; reimplement as typed, state-driven modules.
- **Game rules are pure functions** in `shared/rules.ts`, with no I/O, timers or randomness inside. Randomness is injected.
- **Clients never decide outcomes.** No dice values, damage, HP or results are computed on the client.
- **Identity comes only from the connection** (query parameters at connect time), never from message bodies.
- **The UI is derived from state.** Whether a button is enabled, whose turn it is and the timer display all come from the latest server snapshot.
- No global mutable state; prefer `Record<Seat, …>` over string-built keys.

### Error Handling
- The server rejects invalid intents with an `error` message `{ code, message }`, using the defined error codes (`ROOM_NOT_FOUND`, `CODE_TAKEN`, `ROOM_FULL`, `GAME_IN_PROGRESS`, `NOT_YOUR_TURN`, `STALE_ACTION`, `INVALID_PHASE`, `REPLACED_BY_NEW_TAB`). It never crashes the room or changes state on an invalid intent.
- The client shows a friendly message for each error code and never assumes an intent succeeded until a new state arrives.

### Testing
- Every rule in the rules engine has unit tests (attack order, Shield, Ricochet, Heal cap, Swap, KO, round-8 result, timeouts).
- Server intent validation (wrong seat, wrong phase, stale `turnId`, duplicates) has unit tests.
- Before a change is archived, a manual two-tab test covers the change's scenarios.

## Quality Gates

The scaffold change will define these npm scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm test            # Vitest
```

All three must pass before any commit that completes an OpenSpec phase, and before archiving.

## Git Conventions
- Default branch: `main`
- One feature branch per OpenSpec change: `feature/{change-id}`
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`)

## Key Principles
1. **Server-authoritative:** one source of truth per room; both players always see the same result.
2. **Get two people playing fast:** no accounts, one-click create, a shareable code or link.
3. **Keep the original feel:** the original art, styling and sound for the MVP; polish comes later.
4. **Minimal scope per change:** follow the roadmap in `docs/DESIGN.md`; deferred items stay deferred until a proposal brings them in.
