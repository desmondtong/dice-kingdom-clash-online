# Server smoke test

`twoPlayers.ts` is a **manual** Node 26 smoke test for the PartyKit adapter. It is deliberately not a Vitest file and never starts a server itself.

1. In one terminal, start the PartyKit server on its required local port:

   ```bash
   PATH=/Users/bytedance/.nvm/versions/node/v26.2.0/bin:$PATH \
     npm --cache /tmp/npm-cache-dkc run dev:server
   ```

2. In another terminal, run the smoke test:

   ```bash
   PATH=/Users/bytedance/.nvm/versions/node/v26.2.0/bin:$PATH \
     node tests/server/smoke/twoPlayers.ts
   ```

The script is hard-coded to `ws://localhost:1999/parties/main/{code}`; it does not accept another host or port. It uses Node's built-in `WebSocket` and `node:assert` only.

## What it covers

- Valid random room creation and join with two actual WebSocket clients
- Fatal lifecycle errors: `ROOM_NOT_FOUND`, `CODE_TAKEN`, `ROOM_FULL`, and `GAME_IN_PROGRESS`
- Ready/countdown flow; a full match to `finished`, including the first Cannon timeout
- Mid-turn same-identity refresh, old-tab `REPLACED_BY_NEW_TAB` close (`4000`), rematch first-seat alternation, and normal `leave` close (`1000`)
- Room-state/event consistency, state version ordering, no `playerId` in broadcast state, and message ordering via a retained waiting queue
- A separate lobby room's observed in-memory idle retention after all clients disconnect **without** sending `leave`

## Bounded idle probes

By default the idle-room probes reconnect the same identity at **5 s**, **30 s**, and **65 s** after the initial disconnect. The transcript reports either a measured retention lower bound or a `ROOM_NOT_FOUND` loss interval; it does not assume PartyKit's expiry policy.

Optional environment variables must be positive integer milliseconds and are bounded at 10 minutes:

| Variable | Default | Meaning |
|---|---:|---|
| `DKC_SMOKE_IDLE_PROBES_MS` | `5000,30000,65000` | Strictly increasing, comma-separated probe timestamps after the first disconnect |
| `DKC_SMOKE_TIMEOUT_MS` | `180000` (or enough for the final probe + 90 s) | Bound for the whole smoke run; must exceed the final idle probe |

For example, a quicker local run can use:

```bash
DKC_SMOKE_IDLE_PROBES_MS=1000,3000,5000 DKC_SMOKE_TIMEOUT_MS=120000 \
  node tests/server/smoke/twoPlayers.ts
```
