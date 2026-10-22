# Dice Kingdom Clash Online

A real-time, two-player, turn-based browser game: create a room, share the code, and take turns firing Cannon Dice and rolling Power Dice to topple your opponent's dice tower.

It is the online multiplayer version of [Dice Kingdom Clash](https://github.com/desmondtong/Game-Project-Dice-Kingdom-Clash), which was originally built for two players sharing one screen.

## Status

The project scaffold is in place: the client and the room server start locally and connect. The game itself is not built yet.

- Design plan and roadmap: [`docs/DESIGN.md`](docs/DESIGN.md)
- Development workflow: OpenSpec (see [`openspec/AGENTS.md`](openspec/AGENTS.md) and [`openspec/project.md`](openspec/project.md))

## Tech stack

React 19 + Vite 8 + TypeScript 6 client, PartyKit authoritative room server, run locally: no accounts, no database, no cloud.

## Prerequisites

- **Node.js 26.2.0**, pinned in [`.nvmrc`](.nvmrc). With nvm: `nvm install` (first time), then `nvm use` in the project folder.
- npm (comes with Node).
- Internet access to the public npm registry. The project's [`.npmrc`](.npmrc) pins `https://registry.npmjs.org/`, so installs work the same on any machine.

## Getting started

```bash
nvm use
npm ci           # install exact versions from package-lock.json
npm run dev      # client + room server together
```

Then open http://localhost:5173 in two browser tabs (or two browsers). Each one shows **Server: connected** when the client can reach the room server.

| Process | Address |
|---|---|
| Client (Vite) | http://localhost:5173 |
| Room server (PartyKit) | `ws://localhost:1999` (also listens on your local network) |

Both ports are fixed. If one is already in use, the process reports an error instead of switching to another port. Stop the other process first.

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Starts the client and the room server together |
| `npm run dev:client` | Starts only the client (port 5173) |
| `npm run dev:server` | Starts only the room server (port 1999) |
| `npm run build` | Type-checks and builds the production client into `dist/` |
| `npm run typecheck` | Type-checks client, server and config code (`tsc -b`) |
| `npm run lint` | Runs ESLint |
| `npm test` | Runs all Vitest tests once |
| `npm run test:watch` | Runs Vitest in watch mode |
| `npm run format` | Formats code with Prettier |
| `npm run format:check` | Checks formatting without changing files |

## Repository layout

```
docs/DESIGN.md       Design plan, decision log, roadmap
openspec/            OpenSpec: project context, specs, changes, archive
party/               PartyKit room server (authoritative game state)
shared/              Types, constants and pure rules shared by client and server
src/                 React client
tests/               Vitest tests: rules/, server/ (Node) and client/ (jsdom)
public/assets/       Original artwork and sounds
AGENTS.md            Entry point for AI coding assistants
```

## Credits

Artwork, sounds and game concept come from the original [Dice Kingdom Clash](https://github.com/desmondtong/Game-Project-Dice-Kingdom-Clash) project; see its README for references and credits.
