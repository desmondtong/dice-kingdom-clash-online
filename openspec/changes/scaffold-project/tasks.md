# Implementation Tasks: Scaffold Project

**Change ID:** `scaffold-project`
**Branch:** `feature/scaffold-project`
**Decisions:** DEC-1a, DEC-2a, DEC-3a, DEC-4a, DEC-5b (see `proposal.md`)

---

## Phase 1: Environment and Toolchain Verification

- [x] 1.1 Confirm the prerequisites: Node 26.2.0 selected via nvm (DEC-1), npm registry reachable; agent-run npm commands use `--cache /tmp/npm-cache-dkc` (DEC-3a)
- [x] 1.2 Create the branch `feature/scaffold-project` from a clean `main`
- [x] 1.3 Add `.nvmrc` and `package.json` (name, `private`, `type: module`, `engines.node`)
- [x] 1.4 Install all dependencies with exact versions (pinned in `package-lock.json`):
  - runtime: `react`, `react-dom`, `react-router`, `partysocket`, `bootstrap`, `@fontsource/zcool-kuaile` (DEC-5b); `partyserver` only under DEC-2b
  - dev: `vite`, `@vitejs/plugin-react`, `typescript@~6.0`, `@types/react`, `@types/react-dom`, `@types/node`, `partykit` (DEC-2a) **or** `wrangler` + `@cloudflare/workers-types` (DEC-2b), `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `prettier` + `eslint-config-prettier` (DEC-4a), `concurrently`
- [x] 1.5 Server runtime check inside the project: the placeholder room server starts on port 1999 and answers a WebSocket connection (already verified in a throwaway test for PartyKit 0.0.115 on Node 26.2.0; this repeats it inside the real project)

**Quality Gate:**
- [x] `npm ci` succeeds from the lockfile
- [x] Server starts locally without an account or login

---

## Phase 2: Configuration

- [x] 2.1 TypeScript project references: `tsconfig.json` (references only), `tsconfig.app.json` (`src/`, `shared/`, DOM libs), `tsconfig.server.json` (`party/`, `shared/`, Workers types), `tsconfig.node.json` (config files), and test coverage of `tests/**`
- [x] 2.2 `vite.config.ts`: React plugin, port 5173 with `strictPort`
- [x] 2.3 Server config: `partykit.json` with entry `party/server.ts`, a fixed `compatibilityDate`, and port 1999 in the `dev:server` script (DEC-2a); or `wrangler.jsonc` with the Durable Object binding for the room class (DEC-2b)
- [x] 2.4 `vitest.config.ts`: Node environment by default; jsdom for `tests/client/**`; jest-dom setup file
- [x] 2.5 `eslint.config.js` (flat config): JS recommended, typescript-eslint, react-hooks, react-refresh (for `src/` only), browser/worker/node globals per folder, Prettier compatibility
- [x] 2.6 Prettier config and `.prettierignore` (DEC-4a)
- [x] 2.7 npm scripts: `dev`, `dev:client`, `dev:server`, `build`, `typecheck`, `lint`, `test`, `test:watch`, `format`, `format:check`
- [x] 2.8 Update `.gitignore` for any new tool output (e.g. `.wrangler/`)

**Quality Gate:**
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run format:check` passes

---

## Phase 3: Skeleton, Placeholders and Assets

- [x] 3.1 Folder skeleton with `.gitkeep`: `shared/`, `shared/fixtures/`, `tests/rules/`, `tests/server/`, `tests/client/`
- [x] 3.2 `index.html` with the page title "Dice Kingdom Clash Online"
- [x] 3.3 Placeholder `src/main.tsx` + `src/App.tsx`: imports Bootstrap CSS and the font; shows the app name and the server connection status ("Server: connecting… / connected / disconnected") using `partysocket` to a fixed test room
- [x] 3.4 Placeholder `party/server.ts`: accepts connections and sends a `hello` message on connect; no game logic
- [x] 3.5 One smoke test under `tests/` (e.g. the client placeholder renders its title) so `npm test` has a real test
- [x] 3.6 `git mv "public/assets/brown dice" public/assets/cannon-dice`; check that no asset path contains a space

**Quality Gate:**
- [x] `npm test` passes
- [x] `npm run build` succeeds

---

## Phase 4: Integration and Documentation

- [x] 4.1 Manual check: `npm run dev` → open http://localhost:5173 in two tabs → both show "Server: connected"; stopping the server switches them to "disconnected", and restarting reconnects automatically
- [x] 4.2 Manual check: `/assets/cannon-dice/1.png` loads in the browser
- [x] 4.2a Manual check: the placeholder page renders in ZCOOL KuaiLe and Bootstrap styles are applied, with both loaded from npm (no CDN requests). **If either fails: stop and report to the user (DEC-5 condition); do not substitute.**
- [x] 4.3 Update `README.md`: prerequisites (Node via `.nvmrc`), install, run, available scripts
- [x] 4.4 Update `openspec/project.md`: final tech stack table and quality-gate commands
- [x] 4.5 Update `docs/DESIGN.md`: asset folder name (7.3), and server tooling and run commands (if DEC-2b)

**Quality Gate:**
- [x] All of: `npm run typecheck && npm run lint && npm test && npm run format:check && npm run build`
- [x] Documentation synced

---

## Completion Checklist

- [x] All phases complete
- [x] All quality gates passed
- [x] Documentation synced
- [x] Ready for `/openspec-archive scaffold-project`

---

## Implementation Notes (2026-10-22)

### Deviations and fixes

| # | Item | What happened | Resolution |
|---|---|---|---|
| N1 | Install source and Rolldown binary | The first install used the machine's global npm registry, a private company mirror. That mirror lagged behind: it had `rolldown@1.2.15` (the bundler inside Vite 8) but not its macOS binary, so Vite and Vitest failed to start. A lockfile from a private mirror would also stop anyone outside that network from running `npm ci` | Added a project `.npmrc` that pins the public registry (`https://registry.npmjs.org/`) and regenerated `package-lock.json` from it: all 396 entries resolve to `registry.npmjs.org`. No overrides are needed. The temporary `rolldown` override used during the first attempt was removed |
| N2 | Font side-effect import | TypeScript 6 (`noUncheckedSideEffectImports`) rejects `import "@fontsource/zcool-kuaile"` (no type declaration) | Import the explicit stylesheet `@fontsource/zcool-kuaile/index.css`, which is covered by Vite's `*.css` types |
| N3 | Prettier and Markdown | Running Prettier on the existing hand-written docs would reformat every table | `*.md` is in `.prettierignore`; Prettier formats code and config only |

### Verification results

| Check | Result |
|---|---|
| `npm ci` (public registry), `typecheck`, `lint`, `format:check`, `test` (2 tests), `build` | All pass |
| Lockfile sources | 396 of 396 `resolved` URLs on `registry.npmjs.org`; no private-registry references anywhere in the repo |
| Two tabs at http://localhost:5173 | Both show "Server: connected"; the server log shows 2 WebSocket upgrades on `/parties/main/scaffold-check`, and 2 Node clients each received `{"type":"hello","room":"scaffold-check"}` |
| Stop only the room server (client keeps running) | Both tabs switch to "Server: disconnected" without a page reload |
| Restart only the room server | Both tabs return to "Server: connected" on their own, without a page reload (checked with a per-page marker) |
| Assets | `/assets/cannon-dice/1.png` to `6.png` return 200 `image/png`; no path under `public/assets/` contains a space |
| Font and Bootstrap (DEC-5) | ZCOOL KuaiLe renders on the title (screenshot check); the Bootstrap badge colour is applied; 0 requests to anything other than localhost |
| Port 5173 busy | Second Vite exits with "Port 5173 is already in use" |
| Port 1999 busy | Second PartyKit prints "Address already in use (0.0.0.0:1999)" and does not serve on another port, but keeps running in an error state instead of exiting (stop it manually) |

### Known behaviours (no action needed)

- `partykit dev` listens on `0.0.0.0`, so it is reachable from the local network; Vite listens on `localhost` only.
- `partykit dev` needs an interactive terminal (it registers `b`/`c`/`x` key shortcuts). Starting it in the background without a TTY fails with `setRawMode ENOENT`; `npm run dev` in a normal terminal is fine.
- In agent-run terminals, PartyKit prints "update check failed … chown ~/.config". This comes from the agent's sandboxed terminal (it cannot write to `~/.config`) and is harmless.
- The font package ships many small subset files (`dist/assets/zcool-kuaile-*.woff` / `.woff2`); the browser downloads only the subsets needed for the characters on the page.
