---
id: 8541
title: 'Feature: Canvas-based "Neural" TreeList Animation'
state: OPEN
labels:
  - enhancement
  - design
  - ai
  - performance
  - not-code-ready
  - needs-design
assignees:
  - tobiu
createdAt: '2026-01-11T10:35:01Z'
updatedAt: '2026-06-23T04:20:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8541'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Feature: Canvas-based "Neural" TreeList Animation

**Concept:** Apply the "Neural" Canvas animation to the `TicketsTreeList` (left nav).

**Why:** Unlike the ticket body, the TreeList has 1000s of items and infinite scroll, making it a perfect candidate to demonstrate high-performance, off-main-thread animation at scale.

**Ideas:**
- **Indentation Guide:** A glowing line that traces the active hierarchy branch.
- **Scanner Effect:** A "Cylon" or "Knight Rider" style scanner that highlights the active ticket.

## Timeline

- 2026-01-11T10:35:02Z @tobiu added the `enhancement` label
- 2026-01-11T10:35:02Z @tobiu added the `design` label
- 2026-01-11T10:35:02Z @tobiu added the `ai` label
- 2026-01-11T10:35:02Z @tobiu added the `performance` label
- 2026-01-11T10:39:04Z @tobiu assigned to @tobiu
### @github-actions - 2026-04-12T04:24:32Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-04-12T04:24:33Z @github-actions added the `stale` label
- 2026-04-13T04:36:46Z @github-actions removed the `stale` label
### @neo-gpt - 2026-06-23T04:20:02Z

[ARCH_ALIGNMENT]

I am leaving this open, but routing it out of code-ready status.

Fresh V-B-A:
- #8541 is still the only live issue found for the exact "Canvas-based Neural TreeList Animation" / `TicketsTreeList` idea.
- The portal tickets view already uses the shared content sidenav from `src/app/content/Container.mjs` + `src/app/content/TreeList.mjs`, with the tickets tab enabling lazy child loading in `apps/portal/view/news/tickets/MainContainer.mjs`.
- The existing "neural" canvas substrate is implemented for the ticket/pull/discussion content timeline: `apps/portal/view/content/CanvasWrapper.mjs`, `apps/portal/view/content/TimelineCanvas.mjs`, and `apps/portal/canvas/TimelineCanvas.mjs`.
- That does not automatically make a left-nav TreeList canvas overlay code-ready. A nav overlay would need a separate coordinator contract for virtual/lazy tree rows, scroll, expansion, mobile sidenav state, hit-testing/non-interference, and fallback behavior.
- Adjacent animation history also says not to treat this as visual polish first: #13219 captured the pooled-row animation trap for TreeGrid transitions, where enabling an existing animation primitive without a substrate contract was unsafe.

Routing decision: this should stay as a design/performance exploration until it gets a concrete contract ledger. Useful next shape would be a design note or ticket rewrite that decides whether the nav effect is a decorative canvas layer, a TreeList rendering extension, or a reusable shared overlay primitive, and defines the measurement/scroll/lazy-load contract before implementation.

- 2026-06-23T04:20:02Z @neo-gpt added the `needs-design` label

