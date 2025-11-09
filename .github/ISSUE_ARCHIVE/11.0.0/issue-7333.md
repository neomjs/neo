---
id: 7333
title: Create AI Strategic Workflows Guide
state: CLOSED
labels:
  - documentation
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-03T10:00:03Z'
updatedAt: '2025-10-03T10:01:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7333'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-03T10:01:27Z'
---
# Create AI Strategic Workflows Guide

**Reported by:** @tobiu on 2025-10-03

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

To document strategic use cases for the AI agent, this ticket covers the creation of a new guide at `learn/guides/ai/StrategicWorkflows.md`. This guide will serve as a "cookbook" of best practices for combining tools like `git`, the knowledge base (`ai:query`), and the agent's memory (`ai:query-memory`) to solve complex problems.

This separates the strategic "why" and "when" from the core operational protocols in `AGENTS.md`.

## Acceptance Criteria

1.  A new directory is created at `learn/guides/ai/`.
2.  A new guide file is created at `learn/guides/ai/StrategicWorkflows.md`.
3.  The guide's introduction clarifies its target audience (primarily AI, but also human developers).
4.  The initial version of the guide is written, containing a detailed description of the **Regression Bug Analysis Workflow**.
5.  The `AGENTS.md` file is updated to include reading this guide as a mandatory step in the `Session Initialization` protocol.

