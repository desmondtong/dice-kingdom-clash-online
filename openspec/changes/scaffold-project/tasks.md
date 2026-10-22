# Implementation Tasks: Scaffold Project

**Change ID:** `scaffold-project`
**Branch:** `feature/scaffold-project`
**Decisions:** DEC-1a, DEC-2a, DEC-3a, DEC-4a, DEC-5b (see `proposal.md`)

---

## Phase 1: Environment and Toolchain Verification

- [ ] 1.1 Confirm the prerequisites: Node 26.2.0 selected via nvm (DEC-1), npm registry reachable; agent-run npm commands use `--cache /tmp/npm-cache-dkc` (DEC-3a)
- [ ] 1.2 Create the branch `feature/scaffold-project` from a clean `main`
- [ ] 1.3 Add `.nvmrc` and `package.json` (name, `private`, `type: module`, `engines.node`)
- [ ] 1.4 Install all dependencies with exact versions (pinned in `package-lock.json`):
  - runtime: `react`, `react-dom`, `react-router`, `partysocket`, `bootstrap`, `@fontsource/zcool-kuaile` (DEC-5b); `partyserver` only under DEC-2b
  - dev: `vite`, `@vitejs/plugin-react`, `typescript@~6.0`, `@types/react`, `@types/react-dom`, `@types/node`, `partykit` (DEC-2a) **or** `wrangler` + `@cloudflare/workers-types` (DEC-2b), `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `prettier` + `eslint-config-prettier` (DEC-4a), `concurrently`
- [ ] 1.5 Server runtime check inside the project: the placeholder room server starts on port 1999 and answers a WebSocket connection (already verified in a throwaway test for PartyKit 0.0.115 on Node 26.2.0; this repeats it inside the real project)

**Quality Gate:**
- [ ] `npm ci` succeeds from the lockfile
- [ ] Server starts locally without an account or login

---

## Phase 2: Configuration

- [ ] 2.1 TypeScript project references: `tsconfig.json` (references only), `tsconfig.app.json` (`src/`, `shared/`, DOM libs), `tsconfig.server.json` (`party/`, `shared/`, Workers types), `tsconfig.node.json` (config files), and test coverage of `tests/**`
- [ ] 2.2 `vite.config.ts`: React plugin, port 5173 with `strictPort`
- [ ] 2.3 Server config: `partykit.json` with entry `party/server.ts`, a fixed `compatibilityDate`, and port 1999 in the `dev:server` script (DEC-2a); or `wrangler.jsonc` with the Durable Object binding for the room class (DEC-2b)
- [ ] 2.4 `vitest.config.ts`: Node environment by default; jsdom for `tests/client/**`; jest-dom setup file
- [ ] 2.5 `eslint.config.js` (flat config): JS recommended, typescript-eslint, react-hooks, react-refresh (for `src/` only), browser/worker/node globals per folder, Prettier compatibility
- [ ] 2.6 Prettier config and `.prettierignore` (DEC-4a)
- [ ] 2.7 npm scripts: `dev`, `dev:client`, `dev:server`, `build`, `typecheck`, `lint`, `test`, `test:watch`, `format`, `format:check`
- [ ] 2.8 Update `.gitignore` for any new tool output (e.g. `.wrangler/`)

**Quality Gate:**
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes

---

## Phase 3: Skeleton, Placeholders and Assets

- [ ] 3.1 Folder skeleton with `.gitkeep`: `shared/`, `shared/fixtures/`, `tests/rules/`, `tests/server/`, `tests/client/`
- [ ] 3.2 `index.html` with the page title "Dice Kingdom Clash Online"
- [ ] 3.3 Placeholder `src/main.tsx` + `src/App.tsx`: imports Bootstrap CSS and the font; shows the app name and the server connection status ("Server: connecting… / connected / disconnected") using `partysocket` to a fixed test room
- [ ] 3.4 Placeholder `party/server.ts`: accepts connections and sends a `hello` message on connect; no game logic
- [ ] 3.5 One smoke test under `tests/` (e.g. the client placeholder renders its title) so `npm test` has a real test
- [ ] 3.6 `git mv "public/assets/brown dice" public/assets/cannon-dice`; check that no asset path contains a space

**Quality Gate:**
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

---

## Phase 4: Integration and Documentation

- [ ] 4.1 Manual check: `npm run dev` → open http://localhost:5173 in two tabs → both show "Server: connected"; stopping the server switches them to "disconnected", and restarting reconnects automatically
- [ ] 4.2 Manual check: `/assets/cannon-dice/1.png` loads in the browser
- [ ] 4.2a Manual check: the placeholder page renders in ZCOOL KuaiLe and Bootstrap styles are applied, with both loaded from npm (no CDN requests). **If either fails: stop and report to the user (DEC-5 condition); do not substitute.**
- [ ] 4.3 Update `README.md`: prerequisites (Node via `.nvmrc`), install, run, available scripts
- [ ] 4.4 Update `openspec/project.md`: final tech stack table and quality-gate commands
- [ ] 4.5 Update `docs/DESIGN.md`: asset folder name (7.3), and server tooling and run commands (if DEC-2b)

**Quality Gate:**
- [ ] All of: `npm run typecheck && npm run lint && npm test && npm run format:check && npm run build`
- [ ] Documentation synced

---

## Completion Checklist

- [ ] All phases complete
- [ ] All quality gates passed
- [ ] Documentation synced
- [ ] Ready for `/openspec-archive scaffold-project`
