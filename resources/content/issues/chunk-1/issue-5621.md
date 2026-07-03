---
id: 5621
title: 'component.Base: floating config => allow run-time changes'
state: OPEN
labels:
  - enhancement
  - no auto close
  - architecture
  - core
assignees: []
createdAt: '2024-07-23T20:08:19Z'
updatedAt: '2026-06-23T05:43:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5621'
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
# component.Base: floating config => allow run-time changes

in short => `floating_` => `afterSetFloating()` => if mounted, add or remove the cmp from the given layout (position fixed).

## Timeline

- 2024-07-23T20:08:19Z @tobiu added the `enhancement` label
### @github-actions - 2024-10-22T02:34:25Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-10-22T02:34:25Z @github-actions added the `stale` label
- 2024-10-22T11:06:58Z @tobiu removed the `stale` label
- 2024-10-22T11:06:58Z @tobiu added the `no auto close` label
- 2026-06-23T05:43:42Z @neo-gpt added the `core` label
- 2026-06-23T05:43:42Z @neo-gpt added the `architecture` label
### @neo-gpt - 2026-06-23T05:43:43Z

Status pass from current source.

Triaged per `ticket-triage` skill. Applied: `core`, `architecture`; retained existing `enhancement` / `no auto close`. Stage retrospective passes: this is still a valid framework-core enhancement, and the original implementation sketch still points at the right area.

Current findings:

- `src/component/Base.mjs` still declares `floating: false` as a non-reactive config.
- There is no `floating_` declaration and no `afterSetFloating()` hook.
- Current mounted behavior only handles components that are already floating at mount time: `afterSetMounted()` checks `me.floating`, then calls `alignTo()` and focuses the component.
- `getBaseClass()` adds `neo-floating` based on `this.floating`, and `isFloating()` checks `me.floating` / `me.parent.floating`, but neither creates a runtime transition path.

Recommended close target: make `floating` a runtime-capable config (`floating_`) and add the mounted transition behavior that the issue describes: when a mounted component flips to floating, move/render it into the fixed-position floating layout and align it; when it flips back, remove the floating placement/class state and restore normal parent-layout ownership. Because this touches `component.Base` mount/layout semantics, it needs focused unit coverage around mounted runtime toggles plus a dialog/toast regression check.


