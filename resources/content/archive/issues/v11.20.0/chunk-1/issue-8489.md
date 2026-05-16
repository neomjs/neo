---
id: 8489
title: Refactor defragKnowledgeBase to generic defragChromaDB tool
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-10T00:14:01Z'
updatedAt: '2026-01-10T00:38:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8489'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T00:38:26Z'
---
# Refactor defragKnowledgeBase to generic defragChromaDB tool

Refactor `buildScripts/defragKnowledgeBase.mjs` into a generic CLI tool `buildScripts/defragChromaDB.mjs` using `commander`.

**Goals:**
-   Rename the script to reflect its generic nature.
-   Use `commander` to parse CLI arguments (e.g., `--target <name>`).
-   Support targets: `'knowledge-base'` and `'memory-core'`.
-   Dynamically load the appropriate config file (`ai/mcp/server/.../config.mjs`) to determine DB path, port, and collection names.
-   Implement specific logic for `memory-core` to handle multiple collections (`neo-agent-memory`, `neo-agent-sessions`) safely.
-   Implement a mandatory **Backup Step** before modifying the Memory Core database.
-   Update `package.json` scripts:
    -   `ai:defrag-kb` -> `node buildScripts/defragChromaDB.mjs --target knowledge-base`
    -   Add `ai:defrag-memory` -> `node buildScripts/defragChromaDB.mjs --target memory-core`
-   Update references in `buildScripts/uploadKnowledgeBase.mjs`.

## Timeline

- 2026-01-10T00:14:02Z @tobiu added the `enhancement` label
- 2026-01-10T00:14:03Z @tobiu added the `ai` label
- 2026-01-10T00:14:03Z @tobiu added the `build` label
- 2026-01-10T00:37:22Z @tobiu referenced in commit `2305737` - "feat: Refactor defrag script to generic defragChromaDB tool (#8489)"
- 2026-01-10T00:37:34Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T00:37:45Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully refactored the defragmentation script into a generic CLI tool.
> 
> **Changes:**
> - Refactored `buildScripts/defragKnowledgeBase.mjs` into `buildScripts/defragChromaDB.mjs`.
> - Implemented `commander` for CLI argument parsing (`--target`).
> - Added support for both `knowledge-base` and `memory-core` targets by dynamically loading their config files.
> - Implemented a mandatory **Backup Step** before any destructive operations.
> - Updated `package.json` scripts:
>     - `ai:defrag-kb` now calls the new tool with `--target knowledge-base`.
>     - Added `ai:defrag-memory` calling the new tool with `--target memory-core`.
> - Updated JSDoc references in `buildScripts/uploadKnowledgeBase.mjs`.

- 2026-01-10T00:38:26Z @tobiu closed this issue

