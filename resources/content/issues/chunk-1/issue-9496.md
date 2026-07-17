---
id: 9496
title: 'Grid Multi-Body: Adapt Keyboard Navigation for Split Bodies'
state: OPEN
labels:
  - epic
  - no auto close
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T21:51:30Z'
updatedAt: '2026-07-17T02:50:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9496'
author: tobiu
commentsCount: 3
parentIssue: 9486
subIssues:
  - '[ ] 15195 Align Grid focus ownership after the multi-body split'
subIssuesCompleted: 0
subIssuesTotal: 1
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Grid Multi-Body: Adapt Keyboard Navigation for Split Bodies

As part of the Multi-Body Grid architecture Epic (#9486), Keyboard Navigation must be updated to treat the split physical SubGrids as a single continuous logical grid.

**The Challenge:**
Currently, using Left/Right arrow keys navigates through the DOM structure of a single \`grid.Body\`. In the multi-body setup, the \`grid.Body\` is split. 

**Requirements:**
1. **Logical Coordinate System:** KeyNav must operate entirely on logical coordinates (Column Index x Record Index) rather than physical DOM siblings.
2. **Boundary Crossing:** Navigating Right from the last cell in the \`locked: 'start'\` body must logically move focus/selection into the first cell of the \`center\` body.
3. **Cross-Window Support:** This KeyNav logic must work even if the \`start\` body has been ripped out into a separate physical browser window (as outlined in #9493), by updating the shared \`SelectionModel\` state in the App Worker.

## Timeline

- 2026-03-16T21:51:31Z @tobiu added the `epic` label
- 2026-03-16T21:51:31Z @tobiu added the `ai` label
- 2026-03-16T21:51:31Z @tobiu added the `grid` label
- 2026-03-16T21:51:56Z @tobiu added parent issue #9486
- 2026-03-17T18:59:40Z @tobiu assigned to @tobiu
### @github-actions - 2026-06-16T06:53:44Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-06-16T06:53:44Z @github-actions added the `stale` label
- 2026-06-16T07:21:26Z @tobiu removed the `stale` label
- 2026-06-16T07:21:26Z @tobiu added the `no auto close` label
- 2026-07-15T15:05:09Z @neo-gpt cross-referenced by #15195
- 2026-07-15T15:05:16Z @neo-gpt added sub-issue #15195
### @neo-gpt-emmy - 2026-07-17T02:41:37Z

## Epic Review — Stage 1 Challenge by @neo-gpt-emmy (GPT-5.6 Sol Ultra, Codex)

### Stage 1 — Roadmap Fit

❌

Live `origin/dev` at `2e67e33eb` makes the release boundary explicit: `ROADMAP.md` lists Grid Multi-Body #9486 among the substrate epics deferred from v13.2. #9496 also still requires cross-window continuity through #9493, which is open and has no closing PR. Its one canonical sub, #15195, is a narrower shipped-Grid focus regression rather than delivery of the epic's logical Left/Right and cross-window navigation arc.

As currently structured, the epic mixes a deferred program with an immediately actionable maintenance leaf. Starting #15195 under that parent would either smuggle deferred #9496 scope into the current release lane or force a bounded regression PR to pretend it closes the broader keyboard-navigation program.

### Challenge

Choose one authority shape before sub pickup:

1. Detach/reframe #15195 as a standalone regression-maintenance leaf, preserving its explicit exclusions for full CellModel boundary crossing and cross-window navigation; or
2. Keep #15195 under #9496 and leave both deferred until Grid Multi-Body re-enters the roadmap.

No Stages 2–5 were run because Stage 1 failed. This does not dispute the View-owned focus direction; it challenges only the current roadmap/parent authority.

**Review verdict: Block sub pickup under #9496 as currently roadmapped.**

Origin Session ID: `b681a37a-4353-4ed0-bbf1-b46e6f2501c7`

### @neo-gpt - 2026-07-17T02:50:16Z

## Epic Review — Stage 1 Challenge by @neo-gpt (GPT-5.6 Sol Ultra, Codex)

### Stage 1 — Roadmap Fit

❌

Live `dev` at `2e67e33eb` explicitly lists Grid Multi-Body #9486 in the v13.2 deferred set. #9496 still requires cross-window continuity through #9493; that epic is open and has no closing PR.

The canonical relationship currently contains exactly one sub, #15195. Its live contract is not an incremental delivery of #9496: it explicitly excludes both full CellModel Left/Right traversal across locked-body boundaries and cross-window SubGrid navigation. It is a bounded `bug` + `regression` repair for focus ownership already exposed by the shipped multi-body split.

That makes the current parent edge structurally false in both directions:

- treating #15195 as #9496 delivery smuggles a deferred program into the current lane;
- deferring #15195 with #9496 preserves an actionable focus regression merely because its historical cause belongs to the broader Grid program.

### Challenge

Use one authority shape before pickup:

1. Remove #15195's parent relationship to #9496.
2. Keep #9496 and #9486 as `Related` architectural context in #15195.
3. Leave #9496 deferred until Grid Multi-Body re-enters the roadmap and the #9493 dependency is ready for substantive intake.

No Stages 2–5 were run because Stage 1 failed. This does not challenge #15195's View-owned focus direction; it isolates that maintenance leaf from an epic whose defining navigation requirements it deliberately does not implement.

**Review verdict: Stage-1 block on #9496 as the parent authority; #15195 should proceed only after detachment as a standalone regression leaf.**

Origin Session ID: `411f5206-0c69-4674-ad6f-76a56445d426`

— Euclid (@neo-gpt) · OpenAI GPT-5.6 Sol Ultra


