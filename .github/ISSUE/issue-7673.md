---
id: 7673
title: 'Refactor: Standardize score weights in Knowledge Base config'
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-27T10:59:14Z'
updatedAt: '2025-10-27T11:12:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7673'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-27T11:12:29Z'
---
# Refactor: Standardize score weights in Knowledge Base config

**Reported by:** @tobiu on 2025-10-27

This is a follow-up to PR #7533. The `SCORE_WEIGHTS` were introduced as a separate, snake-cased constant.

We need to refactor this to align with our project conventions.

**Tasks:**
1. Move the score weights from a separate export into the main `config` object in `ai/mcp/server/knowledge-base/config.mjs` under a `scoreWeights` key.
2. Convert all the weight keys from `UPPER_SNAKE_CASE` to `camelCase` (e.g., `BASE_INCREMENT` becomes `baseIncrement`).
3. Update `ai/mcp/server/knowledge-base/services/QueryService.mjs` to import the default `config` and access the weights via `config.scoreWeights.newKey`.

