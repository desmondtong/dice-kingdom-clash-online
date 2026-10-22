# Proposal: Scaffold Project

**Change ID:** `scaffold-project`
**Created:** 2026-10-22
**Status:** Archived (implemented)

---

## Problem Statement

The repository holds only the design (`docs/DESIGN.md`), the OpenSpec structure and the original assets. No application project exists yet, so neither the contracts change nor the two parallel tracks (`build-game-server`, `build-game-client`) can start.

The parallel plan (DESIGN.md section 9.2) also requires that **all dependencies, config files and npm scripts are fixed before the parallel phase**. After that they are read-only for both tracks. This change has to get them right once.

Checks on the laptop while writing this proposal (2026-10-22) found these constraints:

| Finding | Impact |
|---|---|
| Active Node is **v20.10.0**. nvm also has **v26.2.0** installed | Current versions of Vite (8), ESLint (10), Vitest (5), jsdom, concurrently, React Router (8), Wrangler (4) and @testing-library/jest-dom require Node ≥ 20.19 or ≥ 22. Node 20 reached end-of-life in April 2026 |
| npm reported `EPERM` on the cache `~/.npm` and suggested it contained root-owned files. **Corrected after checking:** every file in `~/.npm` and `~/.config` is owned by your own user account. The `EPERM` came from the agent's own sandboxed terminal, which may only write inside the workspace folder and `/tmp` | `npm` works normally in your own terminal. Agent-run installs must use a cache folder the agent is allowed to write to (DEC-3) |
| **PartyKit** (`partykit` 0.0.115) was last published in May 2025 and bundles a July 2024 Cloudflare runtime (miniflare 3.20240718) | No longer actively released; its maintained successor from Cloudflare is **PartyServer + Wrangler**. **Verified on 2026-10-22** with a throwaway test in `/tmp` (with your approval): on Node 26.2.0, `partykit dev` built the server, started on port 1999 and echoed a WebSocket message back. It warned that `compatibilityDate` is missing (to be set in `partykit.json`) |
| PartyKit's update check printed a permissions warning about `~/.config` | Same cause as above (the agent's sandboxed terminal). Harmless; the server still runs. It won't appear in your own terminal |
| `typescript-eslint` 8.72 supports TypeScript **< 6.1** (latest TypeScript is 7.0.2) | TypeScript must be pinned to 6.0.x |

## Pending decisions (need your answer before approval)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **DEC-1** | Node version | (a) **Node 26.2.0** (already installed via nvm), pinned with `.nvmrc`; (b) install Node 24 LTS via nvm; (c) stay on Node 20.10 and pin older packages (Vite 6, Vitest 3, ESLint 9…) | **(a)**: already installed, and supported by every current package |
| **DEC-2** | Realtime server package | (a) **PartyKit** (`partykit` CLI, `partykit dev`) as decided in D1: verified working on Node 26, but no longer actively released; (b) **PartyServer + Wrangler** (`partyserver` 0.5.x, `wrangler dev`): Cloudflare's maintained successor with the same room/`onConnect`/`onMessage` model and the same `partysocket` client; local only, no account; not yet tested on this laptop | **(a)**: it is verified, matches the design and docs as written, and the demo is local-only, so the maintenance risk is low. A move to PartyServer later is small (same client, similar server API) and can be its own change |
| **DEC-3** | npm cache for agent-run installs | No `sudo` fix is needed (see findings). (a) The agent passes `--cache /tmp/npm-cache-dkc` on its own npm commands only; nothing is added to the project, and you use your normal cache; (b) a project `.npmrc` with a local cache folder for everyone | **(a)**: keeps the repo clean and needs no extra permissions |
| **DEC-4** | Formatter | (a) Add **Prettier** with a shared config and a `format` script; (b) no formatter (ESLint only) | **(a)**: two parallel agents produce consistently formatted code, so merges stay clean |
| **DEC-5** | Bootstrap CSS and font source | (a) Bootstrap CSS from npm (works offline); ZCOOL KuaiLe font from Google Fonts as in the original (needs internet); (b) both offline (npm `bootstrap` + `@fontsource/zcool-kuaile`); (c) both from CDN as in the original | **(b)**: the demo works on any laptop without internet |

**All confirmed (2026-10-22):** DEC-1 (a) Node 26.2.0 · DEC-2 (a) PartyKit · DEC-3 (a) agent-only `/tmp` npm cache · DEC-4 (a) Prettier · DEC-5 (b) Bootstrap CSS and ZCOOL KuaiLe from npm.

**Condition on DEC-5:** if the npm Bootstrap CSS or the `@fontsource/zcool-kuaile` font does not install, load or render correctly, implementation **stops and reports the problem to you**. It does not silently switch to a CDN or another font; you decide the replacement.

## Proposed Solution

Create a single npm project at the repository root with:

- **Client:** Vite 8 + React 19 + TypeScript 6.0, React Router, `partysocket`, Bootstrap 5.3 CSS, ZCOOL KuaiLe font.
- **Server:** a placeholder PartyKit room server (`party/server.ts`), run locally with `partykit dev` on **port 1999**, with `compatibilityDate` set in `partykit.json` (DEC-2a; PartyServer + Wrangler under DEC-2b).
- **Tooling:** ESLint 10 (flat config, typescript-eslint, react-hooks, react-refresh), Vitest 5 (Node environment for rules/server tests, jsdom for client tests), Testing Library, Prettier (DEC-4), concurrently.
- **npm scripts:** `dev` (client + server together), `dev:client` (Vite, port 5173), `dev:server` (port 1999), `build`, `typecheck`, `lint`, `test`, `test:watch`, `format`, `format:check`.
- **TypeScript project references:** separate configs for the browser app (`src/`, `shared/`), the server (`party/`, `shared/`, Workers types) and tooling configs, so each side gets the right globals.
- **Folder skeleton** matching the ownership table in DESIGN.md 9.1 (`shared/`, `shared/fixtures/`, `party/`, `src/`, `tests/rules/`, `tests/server/`, `tests/client/`), with `.gitkeep` placeholders.
- **A connectivity smoke check:** the placeholder page connects to the placeholder room server through `partysocket` and shows "Server: connected". This proves the whole local stack works end to end before real code is written.
- **Asset rename:** `public/assets/brown dice/` → `public/assets/cannon-dice/` (`git mv`, so history is kept). No other asset changes.
- **Node pinning:** `.nvmrc` (`26.2.0`) and `"engines": { "node": ">=22.12" }` in `package.json`.

## Scope

### In Scope
- `package.json`, `package-lock.json`, `.nvmrc`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, Prettier config, server config (`partykit.json` under DEC-2a, or `wrangler.jsonc` under DEC-2b), `index.html`
- Placeholder `src/main.tsx`, `src/App.tsx`, `party/server.ts`
- Empty folder skeleton with `.gitkeep`
- One smoke test so `npm test` runs and passes
- Asset folder rename
- Documentation updates: README (setup and run instructions), `openspec/project.md` (final tech stack and quality gates), `docs/DESIGN.md` (asset path; server tooling only if DEC-2b)

### Out of Scope
- Any game types, rules, server logic, screens or styling port (they belong to `define-game-contracts`, `build-game-server` and `build-game-client`)
- Porting `style.css`
- Deleting or optimising assets
- Remote GitHub repository, CI and deployment

## Impact Analysis

| Component | Change Required | Details |
|-----------|-----------------|---------|
| Database | No | None in this project |
| API | No | Protocol is defined in `define-game-contracts` |
| State | No | Placeholder only |
| UI | Yes (placeholder) | A single page showing the app name and server connection status |
| Tooling / config | Yes | All project configuration, frozen after this change for the parallel phase |
| Assets | Yes | One folder renamed |
| Docs | Yes | README, project.md, DESIGN.md |

## Architecture Considerations
- This change sets the project's toolchain for the MVP. After it is archived, config files and `package.json` are read-only during the parallel phase (DESIGN.md 9.2 rules 1 and 2), so **every dependency the MVP needs is added here**, including `partysocket`, the router and client testing libraries.
- A single `npm run dev` starts both processes, while `dev:client` and `dev:server` allow each parallel track to run only its own side on its own port (DESIGN.md 9.2 rule 5).
- Separate tsconfigs prevent browser code from using Worker/Node globals and vice versa; `shared/` is included by both.

## Success Criteria
- [ ] On a clean clone with the pinned Node, `npm ci` succeeds
- [ ] `npm run dev` starts the client on http://localhost:5173 and the server on port 1999, and the page shows "Server: connected"
- [ ] Two browser tabs both show "Server: connected" at the same time
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run format:check` all pass
- [ ] `npm run build` produces a production client bundle without errors
- [ ] No asset path contains a space; images in `public/assets/cannon-dice/` load in the browser
- [ ] No account or login is required at any step

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| npm cache writes are blocked for agent-run installs | High (seen now) | Medium | DEC-3a: the agent uses a `/tmp` cache for its own commands |
| PartyKit stops working with a future Node or OS update (if DEC-2a) | Low | High | Node pinned via `.nvmrc`; exact `partykit` version pinned; migration to PartyServer is a contained change |
| The dev server listens on all network interfaces (`0.0.0.0`), so it is reachable from your local network | Certain (seen in the test) | Low | Fine for a local demo, and it allows testing from a second device on the same Wi-Fi. Use `--ip 127.0.0.1` if you want local-only |
| Newest major versions have integration issues (e.g. Vite 8 + Vitest 5 + ESLint 10) | Low to medium | Medium | Exact versions pinned in the lockfile; quality gates run in task 4; fall back to the previous major for the affected tool and record it in tasks.md |
| A dependency is missed and is needed during the parallel phase | Medium | Medium | Dependency list reviewed against DESIGN.md sections 2, 7 and 8 here; if one is still missed, the blocker process in DESIGN.md 9.2 applies |
| Corporate network or proxy blocks the npm registry | Low (registry reachable today) | High | Detected in task 1; reported as a blocker |

---

## Archive Information

**Archived:** 2026-10-22 15:44
**Duration:** same day (proposal created and archived on 2026-10-22)
**Outcome:** Successfully implemented

### Changes after approval
- Install source moved from the machine's global (private) registry to the public npm registry via a project `.npmrc`, so anyone can run `npm ci`. This removed the temporary `rolldown` override. Recorded as requirement "Reproducible install → Anyone can install".
- DEC-5 behaviour recorded as requirement "Offline-capable styling".
- Details: `tasks.md`, section "Implementation Notes".

### Files Added or Modified
- Tooling: `package.json`, `package-lock.json`, `.npmrc`, `.nvmrc`, `tsconfig.json`, `tsconfig.base.json`, `tsconfig.app.json`, `tsconfig.server.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `partykit.json`
- App placeholders: `index.html`, `src/main.tsx`, `src/App.tsx`, `party/server.ts`
- Tests: `tests/client/setup.ts`, `tests/client/App.test.tsx`
- Skeleton: `shared/`, `shared/fixtures/`, `tests/rules/`, `tests/server/` (`.gitkeep`)
- Assets: `public/assets/brown dice/` renamed to `public/assets/cannon-dice/`
- Docs: `README.md`, `openspec/project.md`, `docs/DESIGN.md`

### Specs Updated
- `openspec/specs/project-setup.md` (new)
