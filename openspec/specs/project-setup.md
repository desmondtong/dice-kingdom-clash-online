# Project Setup Specification

**Status:** Active
**Introduced by:** `scaffold-project` (archived 2026-10-22)
**Covers:** runtime, dependency installation, local development workflow, quality gates, folder layout, asset paths, styling sources

---

## Requirements

### Pinned runtime

The project declares the Node version it supports, so every developer and agent uses the same toolchain.

#### Scenario: Node version is declared
- GIVEN a fresh clone of the repository
- WHEN a developer runs `nvm use`
- THEN the Node version from `.nvmrc` is selected
- AND `package.json` declares a matching `engines.node` range

### Reproducible install

Dependencies install from a committed lockfile with exact versions.

#### Scenario: Clean install
- GIVEN a fresh clone and the pinned Node version
- WHEN the developer runs `npm ci`
- THEN all dependencies install without errors
- AND no account, login or API key is needed

#### Scenario: Anyone can install
- GIVEN a machine on any network with access to the public npm registry
- WHEN the developer runs `npm ci`
- THEN every package downloads from `https://registry.npmjs.org/` (pinned by the project `.npmrc`)
- AND `package-lock.json` contains no private or company registry URLs

### One-command local development

A single command starts the client and the room server together; each side can also be started on its own.

#### Scenario: Start everything
- GIVEN dependencies are installed
- WHEN the developer runs `npm run dev`
- THEN the client is served at http://localhost:5173
- AND the room server accepts WebSocket connections on port 1999

#### Scenario: Start one side only
- GIVEN dependencies are installed
- WHEN the developer runs `npm run dev:client` or `npm run dev:server`
- THEN only that side starts, on its own fixed port (5173 or 1999)
- AND if the port is in use, it fails with an error instead of silently switching ports

### End-to-end connectivity smoke check

The placeholder client proves it can reach the placeholder room server. (This placeholder is replaced by the real app in `build-game-client`.)

#### Scenario: Two tabs connect
- GIVEN `npm run dev` is running
- WHEN two browser tabs open http://localhost:5173
- THEN both tabs show "Server: connected"

#### Scenario: Server restarts
- GIVEN a tab shows "Server: connected"
- WHEN the room server is stopped
- THEN the tab shows "Server: disconnected"
- AND when the server starts again, the tab reconnects automatically and shows "Server: connected"

### Quality gates

The project provides scripts that check types, lint rules, tests, formatting and the production build.

#### Scenario: Gates pass
- GIVEN the code on `main`
- WHEN the developer runs `npm run typecheck`, `npm run lint`, `npm test`, `npm run format:check` and `npm run build`
- THEN every command exits successfully

#### Scenario: Environment-specific type checking
- GIVEN browser code in `src/` and server code in `party/`
- WHEN `npm run typecheck` runs
- THEN `src/` is checked against browser (DOM) types and `party/` against server (Workers) types
- AND `shared/` is checked in both contexts

### Folder ownership skeleton

The folder layout matches the ownership table in `docs/DESIGN.md` section 9.1.

#### Scenario: Skeleton exists
- GIVEN the repository
- THEN the folders `shared/`, `shared/fixtures/`, `party/`, `src/`, `tests/rules/`, `tests/server/` and `tests/client/` exist

### URL-safe asset paths

All original assets are served from paths without spaces.

#### Scenario: Cannon dice assets load
- GIVEN the client is running
- WHEN the browser requests `/assets/cannon-dice/1.png` to `/assets/cannon-dice/6.png`
- THEN each image loads successfully
- AND no file or folder under `public/assets/` contains a space in its name

### Offline-capable styling

Bootstrap CSS and the ZCOOL KuaiLe font are bundled from npm, so the app looks the same without internet access.

#### Scenario: No CDN requests
- GIVEN the client is running
- WHEN the page loads
- THEN Bootstrap styles are applied and headings render in ZCOOL KuaiLe
- AND the page makes no requests to hosts other than the local dev servers

---

## Change History

| Date | Change | Summary |
|---|---|---|
| 2026-10-22 | `scaffold-project` | Spec created: runtime, install, dev workflow, quality gates, folder skeleton, asset paths, offline styling |
