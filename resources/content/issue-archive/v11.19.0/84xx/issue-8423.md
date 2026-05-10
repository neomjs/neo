---
id: 8423
title: Fix SourceParser to prioritize fully qualified className from config
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T13:20:45Z'
updatedAt: '2026-01-08T13:22:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8423'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T13:22:22Z'
---
# Fix SourceParser to prioritize fully qualified className from config

The current implementation of `SourceParser` prefers the local class identifier (e.g., `Base`) over the fully qualified `className` defined in `static config` (e.g., `Neo.component.Base`).

This results in the `ai-class-hierarchy.json` containing ambiguous keys like `Base`, rendering the hierarchy map useless for lookups.

**Task:**
Modify `ai/mcp/server/knowledge-base/parser/SourceParser.mjs` to prioritize the extraction of `className` from the `static config` object. If found, it should overwrite the local identifier.

**Goal:**
Ensure `dist/ai-class-hierarchy.json` uses fully qualified class names as keys.

## Timeline

- 2026-01-08T13:20:47Z @tobiu added the `bug` label
- 2026-01-08T13:20:47Z @tobiu added the `ai` label
- 2026-01-08T13:21:13Z @tobiu assigned to @tobiu
- 2026-01-08T13:22:00Z @tobiu referenced in commit `54ce464` - "fix: Prioritize fully qualified className in SourceParser (#8423)"
### @tobiu - 2026-01-08T13:22:08Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the issue in `SourceParser.mjs`.
> 
> I removed the `!className` condition when parsing the static config block. Now, if a `className` property is found in the static config (e.g., `className: 'Neo.component.Base'`), it will **always** overwrite the initial class identifier (e.g., `Base`).
> 
> This ensures that the generated `ai-class-hierarchy.json` will use correct, fully qualified names as keys.

- 2026-01-08T13:22:22Z @tobiu closed this issue

