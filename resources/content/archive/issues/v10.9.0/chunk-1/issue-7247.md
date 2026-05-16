---
id: 7247
title: Update AI Quick Start Guide
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-24T09:00:53Z'
updatedAt: '2025-09-24T09:02:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7247'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-24T09:02:02Z'
---
# Update AI Quick Start Guide

The `AI_QUICK_START.md` guide is copied into new workspaces created via `npx neo-app`. The previous instructions were only sufficient for working within the `neo` repository itself and needed to be updated to support both use cases.

## Changes

1.  **Clarify Project Setup:** Section 1.3 was rewritten to provide two clear paths:
    -   **A) For contributions to the Neo.mjs framework itself:** Outlines the fork/clone workflow.
    -   **B) For developing in a Neo.mjs workspace:** Instructs users to navigate into their `npx neo-app` generated directory.

2.  **Remove Redundant Prerequisite:** The 'Internet Access' point was removed from the prerequisites list as it is trivial.

## Goal

To ensure the AI Quick Start Guide provides accurate and clear setup instructions for users in both the core framework repository and in a separate workspace, preventing confusion for new users.

## Timeline

- 2025-09-24T09:00:53Z @tobiu assigned to @tobiu
- 2025-09-24T09:00:54Z @tobiu added the `enhancement` label
- 2025-09-24T09:01:46Z @tobiu referenced in commit `87168f8` - "Update AI Quick Start Guide #7247"
- 2025-09-24T09:02:02Z @tobiu closed this issue

