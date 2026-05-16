---
id: 7962
title: Implement Neo.ai.provider.Base
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-01T10:59:41Z'
updatedAt: '2025-12-01T11:26:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7962'
author: tobiu
commentsCount: 1
parentIssue: 7961
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-01T11:26:51Z'
---
# Implement Neo.ai.provider.Base

**Goal:** Create the abstract base class for AI model providers.
**Scope:**
- Define the standard interface for `generate(prompt, config)` and `stream(prompt, config)`.
- Define standard configuration (e.g., `apiKey`, `modelName`).
- Ensure it extends `Neo.core.Base`.
**Context:** Part of Epic #7961.

## Timeline

- 2025-12-01T10:59:42Z @tobiu added the `enhancement` label
- 2025-12-01T10:59:42Z @tobiu added the `ai` label
- 2025-12-01T10:59:56Z @tobiu added parent issue #7961
- 2025-12-01T11:23:21Z @tobiu assigned to @tobiu
- 2025-12-01T11:24:14Z @tobiu referenced in commit `af01101` - "Implement Neo.ai.provider.Base #7962"
### @tobiu - 2025-12-01T11:26:35Z

**Input from Gemini 2.5:**

> ✦ Implemented `Neo.ai.provider.Base` with `requiredEnv` security pattern.
> Moved validation to `construct()` for better lifecycle alignment.

- 2025-12-01T11:26:51Z @tobiu closed this issue

