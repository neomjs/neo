---
id: 9507
title: 'Docs: Clarify Two-Tier Reactivity Architecture and core.Config role'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-03-18T10:05:08Z'
updatedAt: '2026-03-18T10:06:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9507'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-18T10:06:12Z'
---
# Docs: Clarify Two-Tier Reactivity Architecture and core.Config role

The `Reactivity.md` guide currently states that Tier 1 (Push-Based Reactivity) is powered by the `core.Config` system. This is historically inaccurate and conceptually confusing. Tier 1 is powered by the dynamically generated getters and setters created during `Neo.setupClass`.

The `core.Config` system, introduced in v10, actually serves as the **bridge** between the two tiers. Because every reactive config is now internally backed by a `core.Config` instance, the `EffectManager` (Tier 2) can observe ANY reactive instance config natively, as well as standalone custom `core.Config` instances.

This update rewrites the Tier 1 introduction for accuracy and updates the "Synergy" section to explicitly detail how `core.Config` enables this cross-tier observation, heavily leveraging `Neo.state.Provider` and `createHierarchicalDataProxy` as the primary example of this architecture.

## Timeline

- 2026-03-18T10:05:09Z @tobiu added the `documentation` label
- 2026-03-18T10:05:09Z @tobiu added the `ai` label
- 2026-03-18T10:05:19Z @tobiu referenced in commit `ac6764b` - "docs: Clarify Two-Tier Reactivity Architecture and core.Config role (#9507)"
- 2026-03-18T10:05:37Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-18T10:06:12Z

Completed in ac6764b70a4d94543df4398b6ea298a003e555d5

- 2026-03-18T10:06:13Z @tobiu closed this issue

