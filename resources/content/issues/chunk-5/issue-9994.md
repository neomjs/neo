---
id: 9994
title: Align Guide Gap Inference with Concepts instead of Files
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-14T08:19:18Z'
updatedAt: '2026-04-14T08:19:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9994'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Align Guide Gap Inference with Concepts instead of Files

### Description
The current `GUIDE_GAP` inference incorrectly maps architectural guides 1-to-1 with isolated structural files. This is fundamentally disconnected from how learning materials are generated: we need learning section guides for *concepts* (e.g., "Reactivity", "Shared Canvas"), not purely files. For instance, Canvas has multiple related guides mapped in `learn/tree.json`.

### Objective
- Refactor Guide Gap detection in `DreamService` to target the semantic `learn/tree.json` topics and high-level architectural concepts.
- Ensure complex concepts like "Reactivity" or "Shared Canvas" can conceptually satisfy gap requirements across multiple interconnected network topologies in the Graph.

## Timeline

- 2026-04-14T08:19:19Z @tobiu added the `enhancement` label
- 2026-04-14T08:19:19Z @tobiu added the `ai` label

