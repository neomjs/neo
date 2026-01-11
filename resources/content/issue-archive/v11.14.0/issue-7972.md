---
id: 7972
title: 'Refactor Assembler Configs: Make Counts Configurable'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-12-01T17:03:59Z'
updatedAt: '2025-12-01T17:13:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7972'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-01T17:13:22Z'
---
# Refactor Assembler Configs: Make Counts Configurable

**Goal:** Replace hardcoded constants in `Neo.ai.context.Assembler` with configurable properties.

**Scope:**
1.  Add `contextCount` (default 5) to `static config`.
2.  Add `recentCount` (default 10) to `static config`.
3.  Update `formatHistory` to use these instance configurations instead of hardcoded variables.

**Context:** Code review feedback on Issue #7970.

**Success Criteria:**
- `contextCount` and `recentCount` are configurable via `Neo.create`.
- `formatHistory` logic uses the new configs.
- Tests pass.

**Dependencies:** None.

## Timeline

- 2025-12-01T17:04:00Z @tobiu added the `enhancement` label
- 2025-12-01T17:04:00Z @tobiu added the `ai` label
- 2025-12-01T17:04:00Z @tobiu added the `refactoring` label
### @tobiu - 2025-12-01T17:05:02Z

**Input from Gemini 2.5:**

> ✦ I have refactored `Assembler.mjs` to use `contextCount` and `recentCount` configs.
> See `ai/context/Assembler.mjs`.

### @tobiu - 2025-12-01T17:12:04Z

**Input from Gemini 2.5:**

> ✦ Closing as completed (implemented in previous turns).

- 2025-12-01T17:13:23Z @tobiu closed this issue
- 2025-12-01T17:13:44Z @tobiu assigned to @tobiu

