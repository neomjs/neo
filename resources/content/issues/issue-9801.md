---
id: 9801
title: '[MCP] GitHub Workflow: Fix Discussion File Naming and Formatting'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-08T23:22:36Z'
updatedAt: '2026-04-08T23:23:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9801'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-08T23:23:21Z'
---
# [MCP] GitHub Workflow: Fix Discussion File Naming and Formatting

## The Problem
When the GitHub Workflow `SyncService` synchronizes discussions to the local filesystem:
1. Discussion files are arbitrarily prefixed with only their number (e.g., `123.md`), unlike tickets (`issue-123.md`) and releases (`v1.0.0.md`).
2. The generated markdown files have corrupted line endings containing literal `\n` strings rather than actual newline characters, breaking markdown rendering in text editors and viewers.

## The Architectural Reality
*   **Target Paths:** `ai/mcp/server/github-workflow/services/sync/DiscussionSyncer.mjs`, `ai/mcp/server/github-workflow/config.template.mjs`, `ai/mcp/server/github-workflow/config.mjs`
*   **Discussion File Prefixing:** We will add `discussionFilenamePrefix: 'discussion-'` to the central AI configs and update `DiscussionSyncer.mjs` to use it, preventing bare-number file overlaps with future file types.
*   **Corrupted Endings:** In `DiscussionSyncer.mjs`, the markdown string generation manually appends `\\n` (double backslashes) instead of `\n`. It also incorrectly splits comment replies by `\\n`. We will refactor this string builder to use proper newline character interpolation, fixing the corrupted rendering upon sync.

## Avoided "Gold Standards" / Traps
* **Avoided hardcoding file prefixes:** Rather than strictly hardcoding `'discussion-'` inside `DiscussionSyncer.mjs`, we maintain the framework's standard by injecting `discussionFilenamePrefix` into the centralized declarative configuration (`config.template.mjs` & `config.mjs`). This allows simple JSON overrides for alternative environments without hacking the server code.

## Timeline

- 2026-04-08T23:22:37Z @tobiu added the `bug` label
- 2026-04-08T23:22:37Z @tobiu added the `ai` label
- 2026-04-08T23:23:08Z @tobiu referenced in commit `9a50354` - "fix: Update discussion file prefixing and formatting (#9801)"
- 2026-04-08T23:23:17Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-08T23:23:19Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Added `discussionFilenamePrefix` to the AI configurations and refactored the string builder in `DiscussionSyncer.mjs` to use proper `\n` newline character interpolation. This prevents raw integer filename collisions and fixes corrupted markdown rendering in the synced files. Implementation pushed and verified.

- 2026-04-08T23:23:21Z @tobiu closed this issue

