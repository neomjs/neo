# Goal-Scoping Workflow — convert a GOAL into owned LANES

The planning **front-end** of the epic lifecycle. `epic-create` authors ONE epic; `epic-review` / `epic-resolution` review and close it. This skill is the step *before* all of them: it decides **which** lanes (→ epics) a GOAL needs, and how they get owned. Output = a few coherent **owned lanes**, each a durable epic, each self-selected by an owner who drives it to the lane-goal.

## Why this exists (the friction → gold)

A goal with no scoping produces one of two failures — both observed repeatedly, both wrong:

- **No planning** → the team chases scattered **micro-tickets**; parents never close; the goal never converges; capable agents report "nothing to do."
- **Lead micro-manages** → the lead **assigns** peers to lanes ("you take X"). This violates self-assignment + flat-peer agency (`AGENTS.md` §swarm_topology_anchor) — just as bad.

The cure is neither: a planner **defines the goal + the lanes**, and **peers self-select** which lane to own.

## The process

### 1. Define the GOAL
One demonstrable bar — what "done" means, end-to-end. The outcome, not a task list.

### 2. Scope into LANES (the core discipline)
Carve the goal into a **few** (≈2–6) coherent streams — by subsystem / daemon / pillar / capability. A **lane** is *a coherent stream worth a dedicated owner driving it to a sub-goal*. It is NOT:
- a **sliver** (a 50-line change is a PR, not a lane);
- a **scrap-ticket** (do not atomize the goal into N micro-tickets);
- a **flat ticket list** (lanes are owned streams, not a backlog dump).

**The lane test:** would one accountable owner carry this whole stream in their head and drive it to a goal? If it is too small to warrant an owner, it is a *sub* of a lane, not a lane. If it spans unrelated concerns, split it.

### 3. Each lane → an epic
Author each lane as an epic via **`/epic-create`**; linked subs, not prose, are its durable ownership anchor across context wipes.

**Graduation bar:** epic exists; full v1 one-PR leaves are filed/native-linked (`blocked-by` if ordered); source Discussion is closed RESOLVED; peers can claim leaves without hidden context. #14565/#14564 are the 2026-07-04 precedent; epic shells with "subs to follow" repeat the June failure. Epic bodies stay sub-list-free.

### 4. Ownership = SELF-SELECT
The planner **defines** the goal + the lanes (the planning artifact) and **facilitates**. Peers **self-select** the lane they own. The planner **never assigns** a peer to a lane — that is micro-management and violates self-assignment. Surface the lanes; let peers claim them. Each lane needs exactly one accountable owner; if two claim, the earlier claim wins (the later contributes into it).

### 5. Drive to the lane-GOAL
The owner is accountable for the **lane's goal** (close-by-goal, never sub-count) and decomposes internally into **reasonable** units (no micro-slivers). The owner drives ALL their lane's tickets to the lane-goal — which dissolves orphaned tickets, never-closing parents, and "nothing to do."

## Relationship to the epic lifecycle

| Skill | Phase | Owns |
|---|---|---|
| **`goal-scoping`** (this skill) | Front-end | GOAL → the set of owned LANES |
| `epic-create` | Per-lane creation | author each lane as an epic |
| `epic-review` | Per-epic pre-work | review an epic before sub pickup |
| `epic-resolution` | Per-epic closeout | close an epic when its goal is met |

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| No planning (goal → backlog of micro-tickets) | the team chases slivers; nothing converges; "nothing to do" |
| Lead assigns peers to lanes | micro-management; violates self-assignment + flat-peer agency |
| Scrap-ticket explosion (goal → N micro-tickets) | per-unit overhead × N; ownership-amnesia across context-wipes |
| A "lane" that is really a sliver | too small to own; it is a sub, not a lane |
| Epic shell with leaves to follow | not delegatable; hidden planner context |
| Lanes listed in prose, never owned | a backlog dump is not a plan; lanes have accountable owners |
| The planner owns every lane | that is a solo project, not planning; the point is distributed ownership |
