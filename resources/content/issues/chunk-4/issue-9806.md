---
id: 9806
title: Enforce TTL Pruning for Graph Topology Gap Tracking
state: CLOSED
labels:
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-09T08:12:05Z'
updatedAt: '2026-04-09T09:06:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9806'
author: tobiu
commentsCount: 1
parentIssue: 9803
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-09T09:05:51Z'
---
# Enforce TTL Pruning for Graph Topology Gap Tracking

## Problem
Topological gaps and conflict alerts have an infinite lifespan, causing handoff rendering to drag historically resolved issues forward.

## Solution
Attach a `lastGapCheck` temporal metadata property to Native Nodes. During standard Global Decay cycles or inside `synthesizeGoldenPath`, cull (`delete`) capability gap properties that eclipse the 48/72-hour algorithmic thresholds (Time-To-Live).

## Parent Epic
Part of Epic #9803

## Timeline

- 2026-04-09T08:12:06Z @tobiu added the `ai` label
- 2026-04-09T08:12:06Z @tobiu added the `architecture` label
- 2026-04-09T08:12:17Z @tobiu added parent issue #9803
### @tobiu - 2026-04-09T09:05:50Z

Implemented natively in DreamService.mjs during Epic #9803.

- 2026-04-09T09:05:51Z @tobiu closed this issue
- 2026-04-09T09:06:13Z @tobiu assigned to @tobiu

