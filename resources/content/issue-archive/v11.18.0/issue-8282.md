---
id: 8282
title: '[Neural Link] Enhance inspect_class tool description'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-02T00:11:17Z'
updatedAt: '2026-01-02T00:12:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8282'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-02T00:12:52Z'
---
# [Neural Link] Enhance inspect_class tool description

Improve the Open API description for the `inspect_class` tool to explicitly detail its "Rich Blueprint" return structure.

**Goal:**
Ensure future AI agents understand that `inspect_class` returns more than just a flat config list. It includes:
- **Reactive Hooks** (`beforeSet`, `afterSet`)
- **Metadata** (`merge` strategies)
- **Filtered Methods** (Public API only)

**Changes:**
- Update `ai/mcp/server/neural-link/openapi.yaml` to include a detailed breakdown of the response schema in the tool description.


## Activity Log

- 2026-01-02 @tobiu added the `documentation` label
- 2026-01-02 @tobiu added the `ai` label
- 2026-01-02 @tobiu added parent issue #8169
- 2026-01-02 @tobiu assigned to @tobiu
- 2026-01-02 @tobiu closed this issue
- 2026-01-02 @tobiu referenced in commit `8eb43be` - "docs: Enhance inspect_class description in OpenAPI spec

Explicitly documents the Rich Blueprint return structure, including hooks and metadata, to improve agent understanding of the tool's capabilities.

Relates to #8282"

