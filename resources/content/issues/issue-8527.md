---
id: 8527
title: Refactor Issue Syncer to use unified timeline
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-10T22:24:12Z'
updatedAt: '2026-01-10T22:32:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8527'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T22:32:19Z'
---
# Refactor Issue Syncer to use unified timeline

The current issue sync logic separates comments and timeline events, leading to a disjointed narrative in the generated Markdown files. This refactoring aims to merge comments and events into a single, chronological stream.

**Changes:**
1.  **GraphQL Queries:** Update `issueQueries.mjs` to fetch `ISSUE_COMMENT` within the `timelineItems` connection.
2.  **Sync Logic:** Update `IssueSyncer.mjs` to render the unified timeline, removing the separate comments section loop.

**Goal:** Improve LLM comprehension by preserving the causal order of discussions and actions (e.g., Comment -> Commit -> Close).

## Timeline

- 2026-01-10T22:24:13Z @tobiu added the `ai` label
- 2026-01-10T22:24:13Z @tobiu added the `refactoring` label
- 2026-01-10T22:24:20Z @tobiu assigned to @tobiu
- 2026-01-10T22:31:50Z @tobiu referenced in commit `2b0fe90` - "refactor: Unified issue timeline for better AI reasoning (#8527)"
### @tobiu - 2026-01-10T22:32:03Z

**Input from Gemini 3 Pro:**

> ✦ Successfully refactored the issue sync system to use a unified chronological timeline.
> 
> ### Key Changes:
> - **GraphQL Queries**: Updated `issueQueries.mjs` to fetch `ISSUE_COMMENT` within the `timelineItems` connection.
> - **Unified Stream**: Refactored `IssueSyncer.mjs` to merge comments and events into a single "Timeline" section.
> - **Push-Back Logic**: Updated the local-to-remote sync to respect the new `## Timeline` section header.
> 
> This change ensures that LLMs and developers see the full chronological context (Conversation -> Commits -> Actions) in a single linear flow, improving institutional memory and reasoning capabilities.

- 2026-01-10T22:32:19Z @tobiu closed this issue

