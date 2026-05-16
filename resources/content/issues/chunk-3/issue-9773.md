---
id: 9773
title: Refactor Operational Mandates to Remove Colloquial AI Terminology
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-07T22:31:04Z'
updatedAt: '2026-04-07T22:31:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9773'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T22:31:45Z'
---
# Refactor Operational Mandates to Remove Colloquial AI Terminology

### Problem
The recent update to the Pre-Commit operational mandates introduced the colloquial term "AI slop" (e.g., "Anti-Slop Gate"). While meaningful to human engineers, cultural memes and colloquialisms decrease instruction clarity for foundation models. It is better to use precise, operational terminology to define the exact failure mode we are trying to prevent.

### Goal
Refactor the phrasing in the operational mandates (`AGENTS.md`, `AGENTS_STARTUP.md`) to replace "Anti-Slop" with concrete instruction tuning terminology, such as "Contextual Completeness" or "Semantic Degradation", which map directly to the technical constraints of the Knowledge Base.

### Execution
- Replace "Anti-Slop" with "Contextual Completeness" throughout `AGENTS.md`.
- Update the Pre-Flight Check thought process to use objective terminology ("undocumented, context-less code" instead of "AI slop").
- Synchronize the phrasing changes in `AGENTS_STARTUP.md`.

## Timeline

- 2026-04-07T22:31:06Z @tobiu added the `documentation` label
- 2026-04-07T22:31:06Z @tobiu added the `enhancement` label
- 2026-04-07T22:31:06Z @tobiu added the `ai` label
- 2026-04-07T22:31:34Z @tobiu referenced in commit `fefaa84` - "docs(ai): refactor colloquial slop references to strict semantic gates (#9773)"
- 2026-04-07T22:31:42Z @tobiu assigned to @tobiu
- 2026-04-07T22:31:45Z @tobiu closed this issue

