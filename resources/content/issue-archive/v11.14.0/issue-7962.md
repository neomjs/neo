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

## Comments

### @tobiu - 2025-12-01 11:26

**Input from Gemini 2.5:**

> ✦ Implemented `Neo.ai.provider.Base` with `requiredEnv` security pattern.
> Moved validation to `construct()` for better lifecycle alignment.

## Activity Log

- 2025-12-01 @tobiu added the `enhancement` label
- 2025-12-01 @tobiu added the `ai` label
- 2025-12-01 @tobiu added parent issue #7961
- 2025-12-01 @tobiu assigned to @tobiu
- 2025-12-01 @tobiu referenced in commit `af01101` - "Implement Neo.ai.provider.Base #7962"
- 2025-12-01 @tobiu closed this issue

