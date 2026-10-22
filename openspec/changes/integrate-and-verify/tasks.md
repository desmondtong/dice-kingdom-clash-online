# Implementation Tasks: Integrate and Verify

**Change ID:** `integrate-and-verify`
**Status:** Draft (finalise after both parallel tracks are archived)
**Decisions:** I-DEC-1 to I-DEC-4 confirmed as option (a) (see `proposal.md`)
**Branch:** `feature/integrate-and-verify` from `main` after both archives; worktree optional (no other track runs at the same time)
**Writes:** any file, limited to integration fixes (I-DEC-4)

---

## Phase 0: Finalise the proposal (before approval)

- [ ] 0.1 Both `build-game-server` and `build-game-client` are merged and archived on `main`
- [ ] 0.2 Read both archived `tasks.md` Implementation Notes; update `verification-matrix.md` rows to match what was built
- [ ] 0.3 Record the S-DEC-6 idle-room measurement in the proposal's known limitations and row D11
- [ ] 0.4 Write the spec deltas (see `specs/PENDING.md`)
- [x] 0.5a I-DEC-1 to I-DEC-4 confirmed (2026-10-22)
- [ ] 0.5 Set status to Approved; commit to `main`

---

## Phase 1: Run together

- [ ] 1.1 Create `feature/integrate-and-verify` from `main`; `npm ci`; all five gates
- [ ] 1.2 `npm run dev`; confirm the client's default path uses the real connection and both tabs connect
- [ ] 1.3 Run the server smoke script against the running server (G2)

**Quality Gate:** both servers up; smoke script passes

---

## Phase 2: Execute the matrix

- [ ] 2.1 Section A (getting in)
- [ ] 2.2 Section B (lobby and start)
- [ ] 2.3 Section C (playing), repeating matches until all four powers, a KO and a round-8 finish have been seen
- [ ] 2.4 Section D (lifecycle)
- [ ] 2.5 Section E (playing again)
- [ ] 2.6 Section F (look, sound and feel)
- [ ] 2.7 Section G (build and handover), G4 from a fresh clone in `/tmp`
- [ ] 2.8 Record every row in the Verification Log below

---

## Phase 3: Fix

- [ ] 3.1 For each failed row: fix, add a regression test in the owning test folder, re-run the row, log the commit
- [ ] 3.2 Any fix that changes an approved behaviour, a contract or an agreement: stop and ask first (I-DEC-4)
- [ ] 3.3 Re-run the rows a fix could affect

**Quality Gate:** all five gates after each fix

---

## Phase 4: Docs and completion

- [ ] 4.1 Spec deltas synced with the final behaviour (MODIFIED sections only where behaviour changed)
- [ ] 4.2 README: run a two-player game locally, test tips (fresh tab, private window, second browser), known limitations, next iteration (DESIGN.md 10)
- [ ] 4.3 DESIGN.md status line updated
- [ ] 4.4 Final manual match by the user (I-DEC-1)
- [ ] 4.5 Push the branch; report to the coordinator for merge and archive

**Quality Gate (final):** `npm run typecheck`, `npm run lint`, `npm test`, `npm run format:check`, `npm run build`

---

## Verification Log

(Filled in during Phase 2. One line per matrix row: ID, result `pass` / `fail` / `fixed`, notes, fix commit.)

| ID | Result | Notes | Fix commit |
|---|---|---|---|

## Carried over from build-game-server (2026-10-22)

- [ ] Measure idle-room retention after all clients disconnect without Leave (former server task 4.4). First fix the smoke script's idle probe: it waits for a client-initiated close handshake that the local PartyKit runtime does not complete.
