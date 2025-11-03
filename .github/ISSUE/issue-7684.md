---
id: 7684
title: 'Fix: Memory Core Healthcheck `summarizationDetails` schema validation'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-11-01T08:53:16Z'
updatedAt: '2025-11-01T08:56:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7684'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-01T08:56:32Z'
---
# Fix: Memory Core Healthcheck `summarizationDetails` schema validation

**Reported by:** @tobiu on 2025-11-01

The Memory Core `healthcheck` endpoint's OpenAPI schema for `startup.summarizationDetails` was too restrictive, leading to validation errors when the `summarizationStatus` was 'failed' or 'skipped'.

Specifically:
- The `openapi.yaml` expected `processed` and `sessions` properties.
- The `mcp-stdio.mjs` was passing an `error` property for 'failed' status and a `reason` property for 'skipped' status.

This commit updates the `ai/mcp/server/memory-core/openapi.yaml` to use `anyOf` for the `summarizationDetails` property, allowing for the correct schema validation across all `summarizationStatus` values ('completed', 'failed', 'skipped').

This ensures that the `healthcheck` response accurately reflects the summarization details without schema validation failures.

