---
id: 7664
title: 'Docs: Create Codebase Overview Guide'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-26T13:53:15Z'
updatedAt: '2025-10-26T16:10:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7664'
author: tobiu
commentsCount: 0
parentIssue: 7665
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-26T16:10:49Z'
---
# Docs: Create Codebase Overview Guide

As part of the agent protocol simplification epic (#7604), we need a new guide to provide a high-level conceptual map of the Neo.mjs codebase. This guide will replace the need for the agent to parse the large `class-hierarchy.yaml` file for initial discovery.

**Acceptance Criteria:**
1. Create a new file at `learn/guides/fundamentals/CodebaseOverview.md`.
2. The guide should explain the "batteries included" philosophy of the framework.
3. It must provide a high-level overview of the major namespaces within the `src` directory (e.g., `component`, `data`, `form`, `grid`, `manager`, `worker`, etc.), explaining their purpose and how they relate to each other.
4. Add the new guide to `learn/tree.json` under the "Fundamentals & Core Concepts" section.

## Timeline

- 2025-10-26T13:53:16Z @tobiu added the `documentation` label
- 2025-10-26T13:53:17Z @tobiu added the `enhancement` label
- 2025-10-26T13:53:17Z @tobiu added the `ai` label
- 2025-10-26T13:54:06Z @tobiu assigned to @tobiu
- 2025-10-26T13:54:16Z @tobiu added parent issue #7665
- 2025-10-26T14:19:52Z @tobiu referenced in commit `b7da67b` - "Docs: Create Codebase Overview Guide #7664 draft version"
- 2025-10-26T15:22:28Z @tobiu referenced in commit `9ae4dcb` - "#7664 final version"
- 2025-10-26T16:10:50Z @tobiu closed this issue

