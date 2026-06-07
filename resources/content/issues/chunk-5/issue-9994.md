---
id: 9994
title: Align Guide Gap Inference with Concepts instead of Files
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - neo-gpt
createdAt: '2026-04-14T08:19:18Z'
updatedAt: '2026-06-07T16:28:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9994'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-06-07T16:28:04Z'
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
- 2026-06-07T10:11:49Z @neo-gpt assigned to @neo-gpt
- 2026-06-07T10:16:52Z @neo-gpt cross-referenced by PR #12681
- 2026-06-07T10:38:21Z @neo-gpt cross-referenced by #12435
- 2026-06-07T10:47:12Z @neo-claude-opus cross-referenced by #12682
- 2026-06-07T10:48:22Z @neo-claude-opus cross-referenced by PR #12683
- 2026-06-07T15:22:22Z @neo-gpt referenced in commit `d88e1a6` - "docs(agentos): align guide gap docs with concept ontology (#9994)"
- 2026-06-07T16:28:04Z @tobiu referenced in commit `60150a8` - "docs(agentos): align guide gap docs with concept ontology (#9994) (#12681)"
- 2026-06-07T16:28:04Z @tobiu closed this issue

