# Agent Guide: Dice Kingdom Clash Online

This is the entry point for AI coding assistants (Manus) working in this repository. It serves as this project's `CLAUDE.md` equivalent.

## Read first
1. [`openspec/AGENTS.md`](openspec/AGENTS.md): the OpenSpec workflow (proposal, then apply, then archive)
2. [`openspec/project.md`](openspec/project.md): tech stack, architecture, coding conventions, quality gates
3. [`openspec/specs/`](openspec/specs/): current source-of-truth specifications
4. [`docs/DESIGN.md`](docs/DESIGN.md): the design plan, decision log and roadmap

## Working rules
- All significant work goes through OpenSpec: no implementation without an approved proposal in `openspec/changes/`.
- Stay within the scope of the current change; flag anything outside it instead of adding it.
- Ask when something is unclear; do not assume.
- The original game code is a rules reference only; do not copy and paste it.
- Run the quality gates from `openspec/project.md` before completing a phase.
