# Proposal: Integrate and Verify

**Change ID:** `integrate-and-verify`
**Created:** 2026-10-22
**Status:** Draft. Finalise after `build-game-server` and `build-game-client` are both archived (see "Finalising this draft"). Decisions I-DEC-1 to I-DEC-4 confirmed 2026-10-22 (option (a) each).
**Track:** sequential, after both parallel tracks (DESIGN.md 9)

---

## Problem Statement

After the two parallel tracks, the game exists in two halves that have never met:

- The server is verified with unit tests and a Node smoke script, but no browser has played on it.
- The client is verified against fixtures and a mock connection, but has never received a real snapshot.

The original brief asks for a truly networked product: two real people join the same match, see each other's actions, and go through joining, starting, playing, finishing and playing again. Nothing proves that yet. Mismatches between the halves (a message the client does not expect, a timing that does not fit an animation, a lifecycle edge case) only show up when they run together.

## Proposed Solution

1. **Run both halves together** with `npm run dev` (Vite on 5173, PartyKit on 1999). The client's default path already uses the real PartySocket connection (the mock is dev-only behind `?mock=`), so integration is mostly verification, not wiring.
2. **Verify every behaviour with two browser players** using the scenario list in [`verification-matrix.md`](verification-matrix.md). Every row comes from an approved spec (`realtime-sync.md`, the `game-rules`, `room-lifecycle` and `game-ui` specs) or a cross-track agreement (X1 to X8), and is mapped back to the original brief.
3. **Fix integration bugs** where they are found. Each fix gets a regression test in the owning test folder. A fix that changes a confirmed behaviour or a contract comes back for approval first (I-DEC-4).
4. **Record the results** in a verification log in `tasks.md` (pass / fail / fixed, with the fix commit).
5. **Update the specs** with MODIFIED sections only where behaviour changed, and update the README with how to run a two-player game locally, known limitations, and the next-iteration list (for the project's submission notes).

## Scope

### In Scope
- Running client and server together; confirming the real connection is the default and mock mode is unreachable in production builds.
- Executing the full verification matrix (sections A to G).
- Integration fixes in any file, limited to what the matrix finds.
- Regression tests for every fix.
- MODIFIED sections for `game-rules.md`, `room-lifecycle.md`, `game-ui.md` and `realtime-sync.md`, only where behaviour changed.
- README: run a two-player game locally, test tips (two tabs or two browsers), known limitations, next iteration (from DESIGN.md 10).

### Out of Scope
- New features or polish beyond the confirmed specs.
- Everything in DESIGN.md 10 (next iteration): latency handling, grace-period forfeit, persistence, first-player mini-game, spectators, "stay and invite someone new", art and sound polish.
- Deployment (the app runs locally, D1).

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| Client (`src/**`) | Maybe | Integration fixes only |
| Server (`party/**`, `shared/rules.ts`, `shared/rng.ts`) | Maybe | Integration fixes only |
| Contracts (`shared/types.ts`, `constants.ts`, `protocol.ts`, fixtures) | Only with approval | I-DEC-4 |
| Tests | Yes | One regression test per fix |
| Specs | Maybe | MODIFIED sections where behaviour changed |
| Docs | Yes | README; DESIGN.md status line |

## Architecture Considerations

- No new architecture. The connection interface from `build-game-client` means the real and mock connections are interchangeable; integration exercises the real one.
- Both halves keep their split: rules and lifecycle on the server, rendering only on the client. A fix must not move outcome logic to the client.
- Browser storage matters for testing: `playerId` is in `sessionStorage` (per tab), the nickname in `localStorage` (shared). Some browsers copy `sessionStorage` when a tab is **duplicated**, which makes the copy the same player (`REPLACED_BY_NEW_TAB`). Tests open the second player with a fresh tab (paste the invite link), a private window or a second browser; the duplicate-tab case is tested on purpose as the second-tab scenario.

## Decisions (confirmed 2026-10-22)

**I-DEC-1: Who runs the matrix.**
- **(a) Recommended, confirmed:** I run every row with two tabs in the in-app browser, plus the Node smoke script and forged messages from the browser console, and record the results. You finish with one manual match against yourself in two windows, to judge the feel.
- (b) You run the matrix manually from the checklist.

**I-DEC-2: Automated end-to-end tests.**
- **(a) Recommended, confirmed:** no new test framework. Rules and lifecycle are already covered by unit tests, and the server smoke script plays a full match; the matrix covers the browser.
- (b) Add Playwright (not now; can be revisited later) for a scripted two-browser test (a new dev dependency and browser download; about 20 to 30 minutes extra).

**I-DEC-3: Playing from a second device on the same Wi-Fi.**
- **(a) Recommended, confirmed:** out of scope. The demo runs on one laptop; X1 connects to `localhost:1999`.
- (b) Not now; can be revisited later. In scope would mean: the client connects to `${location.hostname}:1999` and Vite runs with `--host`, so a phone or second laptop can join. A small change to X1 and the npm scripts, plus one extra test row.

**I-DEC-4: How fixes are handled.**
- **(a) Recommended, confirmed:** a bug where the code does not match an approved spec is fixed directly, with a regression test, and logged. A fix that would change an approved behaviour, a contract or a cross-track agreement stops and comes back to you first.

## Success Criteria

- [ ] Every row in `verification-matrix.md` is pass or fixed; nothing open.
- [ ] Two players complete the full flow of the brief: create, invite, join, ready, play a whole match, see the same result, rematch, and leave.
- [ ] Both screens show the same state, dice, HP, timer (within 0.5 s) and result at every step, and hear the same sounds.
- [ ] Refresh, second tab, disconnect, leave in each phase, and every error code behave as specified.
- [ ] Forged or repeated messages from the browser console never change the outcome.
- [ ] Every fix has a regression test; all five quality gates pass.
- [ ] A fresh clone runs with `npm ci` and `npm run dev` by following the README.

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| A mismatch needs a contract change | Low | Med | I-DEC-4: stop, propose, get approval, update fixtures and tests together |
| Randomness makes some power effects rare in manual play | High | Low | Exact effects are covered by server unit tests; the matrix checks each power on both screens when it occurs, and repeats matches until all four have been seen |
| Duplicated tabs share `playerId` and confuse testing | Med | Low | Test plan opens fresh tabs; duplicate tab is tested on purpose (D2) |
| Audio autoplay rules differ between tabs | Med | Low | Each tab clicks once before the match; checked in section F |
| PartyKit unloads an idle room sooner than expected | Med | Low | Use the measurement from `build-game-server` (S-DEC-6); document it as a known limitation |

## Finalising this draft

This draft was written while both tracks were still in progress. Before approval:

1. Read the Implementation Notes and deviations in both archived changes, and add, change or remove matrix rows to match.
2. Add the S-DEC-6 idle-room measurement to the known limitations.
3. Write the spec deltas in `specs/` against the then-existing `openspec/specs/` files (see `specs/PENDING.md`).
4. Change the status to Approved (I-DEC-1 to I-DEC-4 are already confirmed).
