# Dice Kingdom Clash Online

A real-time, two-player, turn-based browser game. Create a room, send the invite link, and take turns firing Cannon Dice and rolling Power Dice to topple your opponent's dice tower.

It is the online multiplayer version of my earlier project [Dice Kingdom Clash](https://github.com/desmondtong/Game-Project-Dice-Kingdom-Clash), which was built in plain HTML, CSS and JavaScript for two players sharing one screen. This version is a networked product: each player has their own browser, and an authoritative room server owns the game.

## Quick start for reviewers

Requires **Node.js 26.2.0** (pinned in [`.nvmrc`](.nvmrc)). No account, database, cloud deployment or hosted PartyKit endpoint is needed.

```bash
git clone https://github.com/desmondtong/dice-kingdom-clash-online.git
cd dice-kingdom-clash-online
nvm use          # or install Node 26.2.0 another way
npm ci           # exact versions from package-lock.json (public npm registry)
npm run dev      # starts the React client and the PartyKit room server together
```

Then open **http://localhost:5173** in two separate browser sessions, for example a normal window and a private window, and follow [Test with two players on one laptop](#test-with-two-players-on-one-laptop).

| Process | Address |
|---|---|
| Client (React + Vite) | http://localhost:5173 |
| Local multiplayer room server (PartyKit) | `ws://localhost:1999` |

The client connects to the local room server by default; there is nothing to configure.

## How to play

**Goal:** knock your opponent's tower down to 0 HP, or have more HP than them after 8 rounds.

| Step | What you do |
|---|---|
| 1. Get in | On Home, type a nickname (up to 12 characters) and click **Create Room**, or enter a 4-letter code and click **Join Room**. **How To Play** explains the rules. |
| 2. Invite | In the lobby, copy the invite link (or read out the room code) and send it to the other player. |
| 3. Start | Both players click **Ready**. A 3-2-1 countdown starts on both screens. |
| 4. Play | On your turn, click **Roll** to fire the cannon: damage = die A × die B (1 to 36). In rounds 3 and 6, click the **Power Dice** deck first to get one of four powers. Each step has a 10-second timer. |
| 5. Finish | The result shows the winner and why (knockout, after 8 rounds, or opponent left). Click **Rematch** to play again (both players must agree), or **Back to Home**. |

**Power Dice**

| Power | Effect |
|---|---|
| Shield | Your tower takes half damage (rounded up) from the next hit |
| Ricochet | Your opponent's next shot bounces back onto their own tower |
| Heal | Your tower regains 10 to 20 HP (capped at 50) |
| Swap | The two towers swap HP |

**Music:** the **Music on / Music off** button in the top-right corner mutes only the background music (sound effects keep playing). The choice is remembered, and tabs in the same browser follow it, which helps when testing with two tabs.

**Timeouts:** if the Cannon timer runs out, the turn is skipped. If the Power timer runs out, the server rolls the Power Dice for you, so nobody can stall the match.

**Changes from the original shared-screen game:** after round 8 the higher HP wins (the original always declared a tie); pausing with Esc was removed (one player must not be able to pause a shared online match); the Power step now has a timeout; the first player alternates on each rematch.

## Multiplayer design

The server is the single source of truth. Clients only send **intents** ("roll the cannon now") and render the snapshots the server sends back.

| Concern | How it is handled |
|---|---|
| **Who is authoritative** | The PartyKit room owns all game state, all dice rolls (`crypto.getRandomValues`) and all timers. Game rules are pure functions in [`shared/rules.ts`](shared/rules.ts), run only on the server. |
| **Cheating** | A client cannot choose dice values, damage, HP or a Power Dice: unknown fields are stripped and every intent is checked against the current phase, step, turn and seat. A player's seat is bound to their connection, so they cannot act for the opponent. Player IDs are never broadcast, so a seat cannot be hijacked. |
| **Duplicate actions** | Each step has a `turnId`; only the first matching intent is accepted, so a double click or a resent message gets `STALE_ACTION`. Buttons also disable themselves after a click. |
| **Out-of-order or stale updates** | Every snapshot has an increasing `version`, and clients ignore anything that is not newer. Animations play from an increasing `eventId`, so they are never replayed after a reconnect. |
| **Both sides seeing different results** | Both clients render the same server snapshot. Even the cosmetic dice faces in the towers are seeded, so both screens look identical. |
| **Timing and animation pacing** | After every roll the server holds a short "resolving" window, so both players watch the same animation and hear the same sound before the game moves on. Timers are enforced on the server and only displayed by the clients (corrected for clock offset). |
| **Malformed or hostile messages** | Every message goes through one validator (size limit, JSON, known type, field types). Invalid input gets `INVALID_MESSAGE` and changes nothing. |

### Room and player lifecycle

| Situation | Behaviour |
|---|---|
| Refresh | The player keeps their seat (per-tab player ID in `sessionStorage`) and continues from the current snapshot. |
| Temporary disconnect | The client reconnects automatically; the opponent sees "Opponent disconnected, reconnecting…". Turn timers keep running, so a missing player cannot stall the match. |
| Same player in a second tab | The newest tab takes over the seat; the old tab is told and stops reconnecting. |
| Leave during a match | Asks for confirmation; the remaining player wins at once. |
| Leave in the lobby or countdown | The seat is freed; the remaining player becomes host and can invite someone else. |
| Joining mid-game, full room, wrong code | A friendly message explains why (game in progress, room full, room not found). |
| Play again | Both players vote **Rematch**; each sees the other's vote. Towers reset and the first player alternates. |

## Test with two players on one laptop

1. Keep `npm run dev` running.
2. Open http://localhost:5173 in two separate browser sessions: a normal window and a private window, or two different browsers. Two ordinary tabs also work, because each tab has its own player ID; do not use "Duplicate tab", which some browsers treat as the same player.
3. In the first session, enter a name and click **Create Room**, then copy the invite link.
4. In the second session, paste the invite link (or click **Join Room** and type the code), enter a name and join.
5. Click **Ready** in both sessions.
6. Take turns clicking **Roll** (and the **Power Dice** deck in rounds 3 and 6) until the result appears, then try **Rematch**.

Although both players are on one laptop, they communicate only through the local PartyKit room server; they are not two local game screens. Stop the server (Ctrl+C) and both sessions show "Connection lost, reconnecting…".

Playing from two different laptops needs extra local-network setup and is not part of these instructions.

### PartyKit hosting notice

PartyKit's hosted platform shuts down on October 23, 2026 (hosted deployments were disabled on October 16, 2026; see the [official notice](https://blog.partykit.io/posts/hosted-platform-shutdown)). This project does not depend on it: it runs the installed local PartyKit development server. A future online deployment would be a separate task using a supported approach, not `partykit deploy`.

## Tech stack

React 19 + Vite 8 + TypeScript 6 client, PartyKit room server, Vitest, ESLint and Prettier. Everything runs locally: no accounts, no database, no cloud.

## How it was built

The project was developed spec-first with [OpenSpec](openspec/AGENTS.md): every piece of work is a change with a proposal, a task list and spec updates, reviewed before implementation and archived afterwards.

| Change | What it delivered |
|---|---|
| `scaffold-project` | Tooling, npm scripts, quality gates, asset layout |
| `define-game-contracts` | Shared types, message protocol, error codes, constants and sample game states, frozen before parallel work |
| `build-game-server` | Game rules, cryptographic dice and the authoritative PartyKit room |
| `build-game-client` | React screens, board, animations and sound, built against the sample states |
| `integrate-and-verify` | Client connected to the real server and tested with two players |

The server and client were built **in parallel** by two separate coding agents, each in its own git worktree, branch and dev port, with strict file ownership. They could work independently because the contracts in [`shared/`](shared/) were frozen first and both sides were tested against the same sample states. Design decisions are logged in [`docs/DESIGN.md`](docs/DESIGN.md); the living specs are in [`openspec/specs/`](openspec/specs/).

## Quality checks

```bash
npm run typecheck && npm run lint && npm test && npm run format:check && npm run build
```

Tests cover the shared protocol and sample states, every game rule (with a scripted random source), the room server's lifecycle (with fake connections and timers), and the client's state handling and screens.

## Known limitations

- Local only: there is no public deployment, and playing across two devices needs extra network setup.
- Room state is in memory: restarting the room server ends all rooms.
- No disconnect grace period yet: if a player closes their tab mid-match, their seat is held and their turns time out until they return.
- Desktop layout only (as in the original); no mobile layout.
- The game is mostly luck-driven, as in the original.

## Next iteration

- Network latency feedback: an instant local "rolling…" animation and a ping indicator.
- Disconnect grace period and forfeit (for example 30 seconds, then the connected player wins).
- Persistence of room state, so rooms survive a server restart.
- A mini-game to decide who goes first.
- More player agency, such as holding a Power Dice or one re-roll per match.
- Spectators, and "stay and invite someone new" after an opponent leaves.
- Art, animation and sound polish (dice tumble, screen shake, damage pop-ups, mute toggle, responsive layout) and quick emotes.

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

Both ports are fixed. If one is already in use, the process reports an error instead of switching ports; stop the other process first.

## Repository layout

```
docs/DESIGN.md       Design plan, decision log, roadmap
openspec/            OpenSpec: project context, specs, changes, archive
party/               PartyKit room server (authoritative game state)
shared/              Types, protocol, constants and pure rules shared by client and server
src/                 React client
tests/               Vitest tests: contracts/, rules/, server/ (Node) and client/ (jsdom)
public/assets/       Original artwork and sounds
AGENTS.md            Entry point for AI coding assistants
```

## Credits

Artwork, sounds and the game concept come from the original [Dice Kingdom Clash](https://github.com/desmondtong/Game-Project-Dice-Kingdom-Clash) project; see its README for references and credits. Font: ZCOOL KuaiLe (via Fontsource).
