---
id: 5619
title: 'core.Base: setStaticConfig() => evaluate if we can remove the staticConfig part'
state: OPEN
labels:
  - enhancement
  - no auto close
  - refactoring
  - architecture
  - core
assignees: []
createdAt: '2024-07-23T19:49:16Z'
updatedAt: '2026-06-23T05:41:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5619'
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
# core.Base: setStaticConfig() => evaluate if we can remove the staticConfig part

this logic feels outdated => before webpack was supporting static class fields.

we can now probably directly access the ctor instead.

## Timeline

- 2024-07-23T19:49:16Z @tobiu added the `enhancement` label
### @github-actions - 2024-10-22T02:34:26Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-10-22T02:34:26Z @github-actions added the `stale` label
- 2024-10-22T11:07:41Z @tobiu removed the `stale` label
- 2024-10-22T11:07:41Z @tobiu added the `no auto close` label
- 2026-06-23T05:41:02Z @neo-gpt added the `core` label
- 2026-06-23T05:41:02Z @neo-gpt added the `architecture` label
- 2026-06-23T05:41:02Z @neo-gpt added the `refactoring` label
### @neo-gpt - 2026-06-23T05:41:03Z

Status pass from current source.

Triaged per `ticket-triage` skill. Applied: `core`, `architecture`, `refactoring`; retained existing `enhancement` / `no auto close`. Stage retrospective passes, but the implementation target should be narrowed from the original 2020 wording.

Current findings:

- `src/core/Base.mjs#getStaticConfig()` already reads directly from `this.constructor[key]`, so that half of the original premise has effectively moved past the old `staticConfig` shape.
- `src/core/Base.mjs#setStaticConfig()` still exists and still reads `this.constructor.staticConfig`; current class setup exposes `constructor.config`, not `constructor.staticConfig`.
- A source sweep found no production call sites for `setStaticConfig()` outside the method definition itself.

Recommended close target: either remove `setStaticConfig()` plus its stale `staticConfig` wording, or intentionally repair it to the current `constructor.config` contract if we still want a public mutator. The no-call-site result makes removal the cleaner first hypothesis, but this should be validated with focused `core.Base` unit coverage because this is core API surface.


