---
id: 6781
title: 'Learning Content: TabContainers'
state: OPEN
labels:
  - documentation
  - enhancement
  - no auto close
  - needs-re-triage
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2025-06-12T16:14:34Z'
updatedAt: '2026-06-23T05:26:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6781'
author: tobiu
commentsCount: 1
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
# Learning Content: TabContainers

*(No description provided)*

## Timeline

- 2025-06-12T16:14:35Z @tobiu added the `documentation` label
- 2025-06-12T16:14:35Z @tobiu added the `enhancement` label
- 2025-06-12T16:14:35Z @tobiu added the `no auto close` label
- 2026-06-23T05:26:07Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T05:26:07Z @neo-gpt added the `needs-design` label
- 2026-06-23T05:26:07Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-06-23T05:26:09Z

[ARCH_ALIGNMENT] Triage result: valid documentation target, but not code-ready yet.

Triaged per `ticket-triage` skill. Applied: `not-code-ready`, `needs-design`, `needs-re-triage`.

Evidence checked:
- The ticket body is empty, so the target audience, target file, acceptance criteria, and example scope are not defined.
- `find learn -type f | rg -i 'tab|tabs|tabcontainer'` only surfaced `learn/guides/datahandling/Tables.md`; I did not find a current TabContainer learning guide.
- Source/examples exist and need an explicit source-of-truth selection before writing: `src/tab/Container.mjs`, `src/tab/header/Toolbar.mjs`, `examples/tab/container`, `examples/tabs`, and the portal/shared tab containers.
- Memory/KB context surfaced a known TabContainer footgun: left-docked tabs use `src/tab/header/Toolbar.mjs#getLayoutConfig()` with `column-reverse`, so item array order and visual top-to-bottom order can diverge. A learning guide should teach that deliberately instead of accidentally fossilizing the wrong mental model.

Retrospective challenge:
- Premise passes: TabContainers are important enough for learning content, and the docs surface appears to have a gap.
- Prescription/scope does not pass yet: the issue currently only names a topic. Before implementation, define the intended guide location, audience level, required examples, and whether the guide should cover left/right/bottom tab bars, dynamic add/remove/move APIs, drag resorting, active-index behavior, inactive-card lifecycle, and the left-dock order inversion.

Suggested next shape: turn this into a scoped docs task with a target such as `learn/guides/uibuildingblocks/TabContainers.md` or a datahandling/UI-building-blocks placement decision, plus ACs for source links, live-preview examples, and portal registration.


