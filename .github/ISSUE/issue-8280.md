---
id: 8280
title: '[Neural Link] Feature: Tool inspect_class'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T19:17:53Z'
updatedAt: '2026-01-01T19:18:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8280'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Feature: Tool inspect_class

Implement `inspect_class` to allow AI agents to introspect the schema of a class at runtime.

**Requirements:**
- Input: `className` (string).
- Output: JSON schema including configs (reactive and non-reactive), field definitions (for Models), and public methods.
- Logic:
    - Load the class via `Neo.ns()`.
    - Traverse prototype chain to gather all configs.
    - Identify mixins.
    - Format output for AI consumption (clear, type-aware).

**Why:**
This allows the agent to "read the manual" for the specific app instance it is connected to, ensuring it sends valid data and understands the capabilities of custom components not in its training data.

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu assigned to @tobiu
- 2026-01-01 @tobiu added parent issue #8169

