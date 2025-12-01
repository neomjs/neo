---
id: 7962
title: Implement Neo.ai.provider.Base
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2025-12-01T10:59:41Z'
updatedAt: '2025-12-01T10:59:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7962'
author: tobiu
commentsCount: 0
parentIssue: 7961
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Neo.ai.provider.Base

**Goal:** Create the abstract base class for AI model providers.
**Scope:**
- Define the standard interface for `generate(prompt, config)` and `stream(prompt, config)`.
- Define standard configuration (e.g., `apiKey`, `modelName`).
- Ensure it extends `Neo.core.Base`.
**Context:** Part of Epic #7961.

## Activity Log

- 2025-12-01 @tobiu added the `enhancement` label
- 2025-12-01 @tobiu added the `ai` label
- 2025-12-01 @tobiu added parent issue #7961

