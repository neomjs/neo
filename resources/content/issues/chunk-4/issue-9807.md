---
id: 9807
title: Enforce Type-Aware Gap Targeting Constraints
state: CLOSED
labels:
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-09T08:14:40Z'
updatedAt: '2026-04-09T09:06:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9807'
author: tobiu
commentsCount: 1
parentIssue: 9803
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T09:05:53Z'
---
# Enforce Type-Aware Gap Targeting Constraints

## Problem
Abstract Graph nodes like `CONCEPT`, `EPIC`, and `GUIDE` are being evaluated by `executeCapabilityGapInference` for missing codebase implementations (`src/` or `test/`). This results in false-positive "Codebase Gap" assertions for non-codeable semantic concepts (e.g., "Core Config System", which generated false alerts in Session f08ea938-8982-40e2-bdd5-1ae3d815ca6b).

## Solution
Update the capability gap pipeline to enforce Strict Node-Type Filtering. Inference algorithms must only evaluate physical representation types (`CLASS`, `METHOD`, `COMPONENT`). Higher-order abstract nodes must be skipped to silence these false-positive assertions.

## Parent Epic
Part of Epic #9803

## Timeline

- 2026-04-09T08:14:41Z @tobiu added the `ai` label
- 2026-04-09T08:14:41Z @tobiu added the `architecture` label
- 2026-04-09T08:14:49Z @tobiu added parent issue #9803
### @tobiu - 2026-04-09T09:05:52Z

Implemented natively in DreamService.mjs during Epic #9803.

- 2026-04-09T09:05:53Z @tobiu closed this issue
- 2026-04-09T09:06:15Z @tobiu assigned to @tobiu

