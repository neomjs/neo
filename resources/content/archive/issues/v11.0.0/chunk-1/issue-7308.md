---
id: 7308
title: Create "Working with AI Agents" Guide
state: CLOSED
labels:
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-29T07:52:40Z'
updatedAt: '2025-09-29T09:55:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7308'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-29T09:12:02Z'
---
# Create "Working with AI Agents" Guide

Create a new guide, `WORKING_WITH_AGENTS.md`, to provide comprehensive instructions for human developers on how to effectively and safely collaborate with AI agents within this repository.

This guide covers several critical topics:
1.  **Session Initiation:** How to start a session correctly by directing the agent to `AGENTS.md`.
2.  **Error Recovery:** How to guide an agent to recover from mistakes.
3.  **Agent Behavior:** An explanation of non-determinism and accuracy, setting the right expectations.
4.  **The "Golden Rule":** A critical safety rule about never using "Always Allow" for file modifications, backed by security research on agentic misalignment.
5.  **Panic Responses:** How to spot and handle destructive agent behavior.
6.  **The Session Lifecycle:** An analogy for understanding agent context degradation over time.
7.  **Proactive Context Management:** A best practice for knowing when to start a fresh session.

## Timeline

- 2025-09-29T07:52:40Z @tobiu assigned to @tobiu
- 2025-09-29T07:52:42Z @tobiu added the `documentation` label
- 2025-09-29T07:52:42Z @tobiu added the `enhancement` label
- 2025-09-29T07:53:15Z @tobiu referenced in commit `c9fcd8b` - "Create "Working with AI Agents" Guide #7308 WIP"
- 2025-09-29T07:57:48Z @tobiu referenced in commit `8e9fe96` - "#7308 write file tool"
- 2025-09-29T08:01:58Z @tobiu referenced in commit `5d21ade` - "#7308 dealing with panic responses"
- 2025-09-29T08:22:52Z @tobiu referenced in commit `21f91f7` - "#7308 human lifetime analogy"
- 2025-09-29T08:29:21Z @tobiu referenced in commit `c2bbd70` - "#7308 agentic misalignment"
- 2025-09-29T08:33:56Z @tobiu referenced in commit `0ed12fd` - "#7308 proactive context management"
- 2025-09-29T08:54:22Z @tobiu referenced in commit `57e2413` - "#7308 Fully Automated Workflows"
- 2025-09-29T08:54:43Z @tobiu referenced in commit `8d007c1` - "#7308 Fully Automated Workflows"
- 2025-09-29T09:08:28Z @tobiu referenced in commit `f290c87` - "#7308 final polishing"
- 2025-09-29T09:08:35Z @tobiu closed this issue
- 2025-09-29T09:11:43Z @tobiu reopened this issue
- 2025-09-29T09:12:00Z @tobiu referenced in commit `2efbcef` - "#7308 final polishing"
- 2025-09-29T09:12:02Z @tobiu closed this issue

