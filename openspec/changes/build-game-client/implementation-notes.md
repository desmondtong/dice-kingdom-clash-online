# Build Game Client: Implementation Notes

## Scope and baseline

Implementation stays in `src/**`, `tests/client/**`, and this change folder, in the existing `build-game-client` worktree on `feature/build-game-client`. Dependencies and the worktree were reused. All five baseline quality gates passed with the already-installed Node 26.2.0 runtime. The terminal originally selected Node 20.10.0; selecting the pinned runtime through command-local `PATH` resolved the Vitest startup failure without installation or configuration changes.

Only Vite is run, at `127.0.0.1:5173` with strict port binding. PartyKit is not started. The Host's post-edit diagnostic registration has no active managed project; the repository's frozen configuration and strict file scope are preserved, and the existing TypeScript check-only gate is used instead. No managed-project declaration, template, hosting, or configuration files were introduced.

## Original reference

The original [index.html and Tutorial](https://raw.githubusercontent.com/desmondtong/Game-Project-Dice-Kingdom-Clash/main/index.html) and [style.css](https://raw.githubusercontent.com/desmondtong/Game-Project-Dice-Kingdom-Clash/main/style.css) were read on 2026-10-22. The adaptation keeps the exact pastel variables, npm-bundled ZCOOL KuaiLe and Bootstrap CSS, existing artwork/sounds, fixed seat order, five-column fifty-die towers, cannon multiplication, and Power deck. The original `name-logo.png` is a small corner mark, not a large game-title hero. React replaces Bootstrap JavaScript modals. Tutorial rules explicitly replace the original no-Power-timeout behavior and automatic round-eight tie with server auto-roll and higher-HP victory.

No original game JavaScript was copied. No images, fonts, sounds, or dependencies were added.

## Development and integration boundary

`useRoom` defaults to the fixture-backed demo in development so normal Home create/join flows are safe on this client-only track. Explicit `?mock=<fixtureName>&seat=1|2` selects a frozen snapshot; `?mock=demo` selects the timer/click-driven recording. The gallery and both mock modules are guarded by `import.meta.env.DEV` and lazy imports, so they are eliminated from the production JavaScript. Production uses the implemented PartySocket adapter; it has only been tested with a fake socket, not run against a real server. `integrate-and-verify` owns selecting the real connection for development and two-tab network integration.

The mock demo is a presentation recording, not a simulation of the rules. It visits all eight round labels and recorded Power, cannon, skipped-turn, disconnect and finished snapshots. HP, dice, damage and results are copied verbatim from fixtures, with only room/version/clock/event identity/round metadata adapted. Both-seat rematches reset the recording and alternate the first seat; this is not evidence of authoritative rule correctness.

## Networking decisions

A create request gets at most five retries after the initial code collision. The URL changes only after a retry has received `welcome`, preventing navigation from resetting the retry budget. The accepted code then reconnects with `intent=join`. Membership is remembered only after welcome and forgotten on Leave or Back to Home.

A reconnect snapshot with the same version restores connection readiness while preserving the existing state, clock offset, event deduplication and pending-action latch. Stale snapshots never replace the board. Recoverable errors preserve the latest state and release the action latch. `INVALID_MESSAGE` is treated as fatal before welcome, and non-fatal afterward.

Animation HP is taken from retained authoritative snapshots, never reconstructed from damage. When there is no prior snapshot (such as opening a resolving fixture directly), the authoritative HP is shown immediately. Cosmetic tower faces alone use a deterministic seed hash.

## Verification

The pre-rebase full pass succeeded: TypeScript, ESLint (no warnings), Vitest (364 tests in 14 files), Prettier, production build, and `git diff --check`. Each implementation phase is covered by the full pass. The production JavaScript scan found no fixture gallery, mock module, fixture names, or demo tape.

The In-App Browser opened all 17 frozen fixtures for seats 1 and 2 (34 views). Correct phases and action eligibility were inspected; no completed image had a broken source. Both scripted demo seats progressed through the eight-round recording to the correct win/lose result (22 HP versus 15 HP), accepted a rematch vote, and returned to play with seat 2 acting first. Home, Tutorial, the Leave warning, and Stay were also exercised. Artwork, seeded towers, Power deck, cannon and desktop layout were visually inspected against the original HTML/CSS reference. The board intentionally has a 1150px minimum width and horizontally scrolls in a narrower browser pane, as approved in C-DEC-7.

Audio event mapping, impact/reveal timing, overlap safety, BGM first-click unlock/loop/volume, and cleanup are verified with mocked Audio. The browser click path exercises unlock; audible output cannot be assessed from browser screenshots, so no listening claim is made.

The coordinator advanced `main` during implementation with the integration proposal and a contract-test cleanup. The worktree-only frozen-path diff was empty before rebase. Those coordinator commits are incorporated by rebase rather than manually editing frozen files. No merge or archive is performed on this track.

## Coordinator handoff

The client implementation commit is `24b83de6a4add98973a066a0f4a099e265753031`, rebased onto coordinator `main` commit `c734a8d`. All five gates passed again after the rebase: 364 tests in 14 files, clean typecheck/lint/format, and successful production build. The complete diff against that `main` includes only `src/**`, `tests/client/**`, and this change folder; every frozen/server-owned path has an empty diff. `src/**` contains no `Math.random`.

`feature/build-game-client` was successfully pushed to `origin` with its upstream set. The completion documentation is committed and pushed separately. No PR, merge, or archive was performed. The Vite-only verification service is stopped after testing to free port 5173 for the integration track.

For local client inspection, use the existing pinned Node runtime and `npm --cache /tmp/npm-cache-dkc run dev:client -- --host 127.0.0.1 --port 5173 --strictPort`, then open `/dev/fixtures` or `/room/KX7P?mock=demo&seat=1` (also seat 2). Do not use the combined `npm run dev` on this track because it starts PartyKit. The real adapter remains fake-tested only; network integration belongs to the next approved change.
