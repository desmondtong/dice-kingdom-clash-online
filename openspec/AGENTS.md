# OpenSpec Agent Instructions

This file gives instructions to AI coding assistants (primarily **Manus**) working with the OpenSpec workflow in this project.

## Overview

OpenSpec is a Spec-Driven Development (SDD) framework that keeps a "living specification" as the single source of truth. All significant feature work follows a structured workflow, so requirements and implementation stay aligned.

Read these before any OpenSpec work:
1. `openspec/project.md`: project context, conventions, quality gates
2. `openspec/specs/`: current source-of-truth specifications
3. `docs/DESIGN.md`: the design plan and roadmap (planning reference)
4. `AGENTS.md` (repo root): project conventions for agents (this project's equivalent of `CLAUDE.md`)

## Directory Structure

```
openspec/
├── AGENTS.md           ← This file (AI instructions)
├── project.md          ← Project context and conventions
├── specs/              ← Source-of-truth specifications
├── changes/            ← Active change proposals
│   └── {change-id}/
│       ├── proposal.md ← What and why
│       ├── tasks.md    ← Implementation checklist
│       └── specs/      ← Delta specifications
└── archive/            ← Completed changes history
```

## Workflow Commands

### 1. `/openspec-proposal <description>`
**Purpose:** Create a new change proposal.

1. Create the `openspec/changes/{change-id}/` directory
2. Create `proposal.md` with the problem, solution, scope and impact
3. Create `tasks.md` with an implementation checklist
4. Create `specs/{component}_delta.md` with the specification changes
5. Present it for review. **Do not implement until the proposal is approved.**

**Change ID format:** `kebab-case-description` (e.g. `scaffold-project`)

### 2. `/openspec-apply <change-id>`
**Purpose:** Implement an approved change.

1. Work on the branch `feature/{change-id}`
2. Read `openspec/changes/{change-id}/proposal.md`
3. Follow the tasks in `openspec/changes/{change-id}/tasks.md`, marking each one `[x]` as it is completed
4. Make sure the implementation matches the delta specs
5. Run the quality gates from `project.md` after each phase
6. Stop and ask when anything is unclear or out of scope

### 3. `/openspec-archive <change-id>`
**Purpose:** Complete a change and update the source of truth.

1. Verify that every task in `tasks.md` is complete and the quality gates pass
2. Merge the delta specs into `openspec/specs/`
3. Move the change directory to `openspec/archive/{change-id}/`
4. Add a completion timestamp to the archived proposal

## Delta Spec Format

```markdown
# Delta: {Component Name}

## ADDED
### Requirement: {New Requirement}
Description of the new functionality...

#### Scenario: {Scenario Name}
- GIVEN {precondition}
- WHEN {action}
- THEN {expected result}

## MODIFIED
### Requirement: {Existing Requirement}
Updated description...

## REMOVED
### Requirement: {Deprecated Requirement}
Reason for removal...
```

## Quality Standards

Before archiving, verify:
- [ ] All tasks are marked complete
- [ ] Tests pass
- [ ] Typecheck and lint are clean
- [ ] Documentation is synced
- [ ] The delta specs accurately reflect the changes

## When to Use OpenSpec

| Scenario | Recommendation |
|----------|----------------|
| New major feature | Use OpenSpec |
| Complex multi-phase changes | Use OpenSpec |
| Bug fixes | Skip OpenSpec |
| Small enhancements | Optional |
| Rapid prototyping | Skip OpenSpec |
