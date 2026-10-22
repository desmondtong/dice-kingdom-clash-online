# Project Context

## Overview

**Dice Kingdom Clash Online** is a real-time, two-player, turn-based browser game. It turns the original single-screen *Dice Kingdom Clash* ([original repo](https://github.com/desmondtong/Game-Project-Dice-Kingdom-Clash)) into a networked game: two players create or join a room with a short code, take turns rolling Cannon Dice and Power Dice to destroy each other's dice tower, and can rematch in the same room.

The full design, decision log and roadmap are in [`docs/DESIGN.md`](../docs/DESIGN.md). That document is the planning reference. **`openspec/specs/` becomes the source of truth** as changes are archived.

The project is a local demo: it runs entirely on one laptop. It has no accounts, no database and no cloud deployment.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 26.2.0 (pinned in `.nvmrc`; `engines.node` `>=22.12`) |
| Client framework | React 19 + Vite 8 + TypeScript 6.0 (TypeScript 7 is not yet supported by `typescript-eslint`) |
| Routing | React Router 8 (`react-router`) |
| Realtime / authoritative server | PartyKit 0.0.115 (local `partykit dev` on port 1999), one room instance per room code |
| Client networking | `partysocket` 1.3 (WebSocket with auto-reconnect; React hook `partysocket/react`) |
| State management | Server-owned `RoomState`; the client renders server snapshots (React state/hooks only, no client state library) |
| Database | None. Room state is in memory (persistence is a later iteration) |
| Identity | Anonymous `playerId` (UUID) in `sessionStorage` plus a nickname; no accounts |
| Styling | Original `style.css` ported as global CSS, Bootstrap 5.3 CSS from npm (no Bootstrap JS), ZCOOL KuaiLe font from npm (`@fontsource/zcool-kuaile`); no CDN, works offline |
| Testing | Vitest 5 with two projects: `node` (`tests/contracts`, `tests/rules`, `tests/server`) and `client` (jsdom + Testing Library, `tests/client`) |
| Lint / format | ESLint 10 (flat config, typescript-eslint, react-hooks, react-refresh) + Prettier 3 (Markdown is not auto-formatted) |
| Package manager | npm, exact versions (`--save-exact`) with a committed `package-lock.json` |

**Registry:** the project `.npmrc` pins the public npm registry (`https://registry.npmjs.org/`), so `package-lock.json` only references public URLs and anyone can run `npm ci`. Do not commit a lockfile generated from a private mirror. If a developer's machine must use another registry, install with `npm ci --registry=<url>` and do not commit lockfile changes from that install.

**TypeScript projects:** `tsconfig.app.json` (browser: `src/`, `shared/`, `tests/client/`, `tests/rules/`), `tsconfig.server.json` (Workers runtime: `party/`, `shared/`, `tests/contracts/`, `tests/server/`) and `tsconfig.node.json` (config files). `shared/` must type-check in both the browser and the server context.

## Architecture

The server is authoritative. Clients send **intents** only (`ready`, `rollPower`, `rollCannon`, `rematch`, `leave`). The server validates each intent against phase, step, seat and `turnId`; it generates all randomness with `crypto.getRandomValues`, applies the rules, runs all timers, and broadcasts versioned `state` snapshots. Each connection first receives a private `welcome { seat, code }`; no `playerId` is ever broadcast. Animations and sounds are triggered by `state.lastEvent` (there is no separate event message). The contracts are in `shared/` and specified in `openspec/specs/realtime-sync.md`.

Structure (`shared/` is created by `define-game-contracts`; most of `src/` and `party/` by later changes):

```
party/server.ts        # PartyKit room: lifecycle, connection↔seat binding, validation, timers, broadcast
shared/types.ts        # RoomState, MatchState, GameEvent, Client/ServerMessage, Rng
shared/constants.ts    # rules, timing, room code, name limit, error codes
shared/protocol.ts     # parseClientMessage, parseConnectParams, sanitizeName, limitNameInput, makeTurnId
shared/rules.ts        # pure rule functions: (match, rng) → { match, event }
shared/rng.ts          # crypto-based dice helpers
shared/errors.ts       # NotImplementedError for contract stubs
shared/fixtures/       # sample RoomStates for every phase and step, sample messages
src/                   # React app: pages/, components/, net/, audio/, styles/
public/assets/         # original artwork and sounds
tests/                 # Vitest tests: contracts/, rules/ and server/ (Node), client/ (jsdom)
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
- The server rejects invalid intents with an `error` message `{ code, message }`, using the 9 error codes in `shared/constants.ts`. Fatal (the server closes the connection; the client does not auto-reconnect): `ROOM_NOT_FOUND`, `CODE_TAKEN`, `ROOM_FULL`, `GAME_IN_PROGRESS`, `REPLACED_BY_NEW_TAB`. Non-fatal (connection stays open, state unchanged): `NOT_YOUR_TURN`, `STALE_ACTION`, `INVALID_PHASE`, `INVALID_MESSAGE`. `INVALID_MESSAGE` is fatal only for invalid connect parameters. The server never crashes the room or changes state on an invalid intent; all untrusted input goes through `parseClientMessage` / `parseConnectParams`.
- The client shows a friendly message for each error code and never assumes an intent succeeded until a new state arrives.

### Testing
- Every rule in the rules engine has unit tests (attack order, Shield, Ricochet, Heal cap, Swap, KO, round-8 result, timeouts).
- Server intent validation (wrong seat, wrong phase, stale `turnId`, duplicates) has unit tests.
- Before a change is archived, a manual two-tab test covers the change's scenarios.

## Quality Gates

```bash
npm run typecheck      # tsc -b (client, server and config projects)
npm run lint           # ESLint
npm test               # Vitest (all projects, single run)
npm run format:check   # Prettier
npm run build          # type-check + production client build
```

All five must pass before any commit that completes an OpenSpec phase, and before archiving.

Agents running npm on the laptop use `--cache /tmp/npm-cache-dkc` (their sandboxed terminal cannot write to `~/.npm`). Developers use npm normally.

## Git Conventions
- Default branch: `main`
- One feature branch per OpenSpec change: `feature/{change-id}`
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`)

## Change Sequence and Parallel Development

The MVP is delivered as five changes; full details are in `docs/DESIGN.md` section 9.

1. `scaffold-project` (sequential)
2. `define-game-contracts` (sequential)
3. `build-game-server` and `build-game-client` (**in parallel**)
4. `integrate-and-verify` (sequential)

Rules for the parallel phase:
- Contracts (`shared/types.ts`, `shared/constants.ts`, `shared/protocol.ts`, `shared/errors.ts`, `shared/fixtures/**`, `tests/contracts/**`), config files and `package.json` are read-only. `shared/rules.ts` and `shared/rng.ts` signatures are frozen; only `build-game-server` replaces their bodies. If a change to them is needed, raise a blocker; never edit them on a track branch.
- Each track writes only to the files it owns (DESIGN.md 9.1) and only to its own spec files.
- Each track works in its own worktree, `../dice-kingdom-clash-online-worktrees/{change-id}`, on `feature/{change-id}`.
- Dev ports: the server track uses 1999 (PartyKit); the client track uses 5173 (Vite, mocks only).
- The coordinator owns `main`, merges and archiving. Order: server first, then client.

## Key Principles
1. **Server-authoritative:** one source of truth per room; both players always see the same result.
2. **Get two people playing fast:** no accounts, one-click create, a shareable code or link.
3. **Keep the original feel:** the original art, styling and sound for the MVP; polish comes later.
4. **Minimal scope per change:** follow the roadmap in `docs/DESIGN.md`; deferred items stay deferred until a proposal brings them in.
