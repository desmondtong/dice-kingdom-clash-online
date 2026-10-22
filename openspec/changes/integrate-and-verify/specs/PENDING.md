# Spec Deltas: Pending

**Change ID:** `integrate-and-verify`

The spec deltas for this change are written **after** `build-game-server` and `build-game-client` are archived, because the target spec files do not exist on `main` until then:

| Target spec | Created by | Delta type expected |
|---|---|---|
| `openspec/specs/realtime-sync.md` | `define-game-contracts` (exists) | MODIFIED, only if integration changes behaviour |
| `openspec/specs/game-rules.md` | `build-game-server` | MODIFIED, only if integration changes behaviour |
| `openspec/specs/room-lifecycle.md` | `build-game-server` | MODIFIED, only if integration changes behaviour |
| `openspec/specs/game-ui.md` | `build-game-client` | MODIFIED, only if integration changes behaviour |

If integration changes no behaviour, this change has no spec deltas, and this file is replaced by a note saying so. This file is removed when the real delta files are written (task 0.4).
