---
id: 7933
title: Fix misleading sessionId examples in Memory Core OpenAPI
state: CLOSED
labels:
  - documentation
  - ai
  - 'agent-task:review'
assignees:
  - tobiu
createdAt: '2025-11-29T21:21:53Z'
updatedAt: '2025-11-29T21:48:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7933'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T21:48:40Z'
---
# Fix misleading sessionId examples in Memory Core OpenAPI


```yaml
# AGENT TASK CONTRACT
version: 1.0
type: implementation
role: dev

goal: >
  Fix misleading sessionId examples in Memory Core OpenAPI.
  Replace 'session_1696800000000' with a UUID example.

context:
  epic_issue: 7914
  files:
    - "ai/mcp/server/memory-core/openapi.yaml"

requirements:
  - "Replace all occurrences of 'session_1696800000000' with '550e8400-e29b-41d4-a716-446655440000'."
```


## Timeline

- 2025-11-29T21:21:54Z @tobiu added the `documentation` label
- 2025-11-29T21:21:54Z @tobiu added the `ai` label
- 2025-11-29T21:22:51Z @tobiu assigned to @tobiu
- 2025-11-29T21:36:02Z @tobiu cross-referenced by PR #7934
- 2025-11-29T21:43:45Z @tobiu added the `agent-task:review` label
- 2025-11-29T21:43:58Z @tobiu cross-referenced by #7917
- 2025-11-29T21:48:40Z @tobiu closed this issue

