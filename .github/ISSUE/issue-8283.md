---
id: 8283
title: '[Neural Link] Feature: inspect_class tiered detail (compact mode)'
state: OPEN
labels:
  - enhancement
  - ai
  - performance
assignees: []
createdAt: '2026-01-02T00:35:46Z'
updatedAt: '2026-01-02T00:35:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8283'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Feature: inspect_class tiered detail (compact mode)

Enhance the `inspect_class` tool to support a `detail` parameter for token-efficient querying.

**Problem:**
Currently, `inspect_class` returns the full class blueprint (inheritance, all configs, all methods), which can consume ~10K tokens. This is expensive for simple discovery tasks (e.g., "Does this class have a `text` config?").

**Solution:**
Add an optional `detail` parameter:
- `compact`: Returns ONLY "Own" configs and methods (defined on this class).
- `standard` (Default): Returns full inheritance (current behavior).

**Implementation:**
- Compare `ctor.config` with `superCtor.config` to identify "Own" configs (new keys or changed values).
- Use `proto.hasOwnProperty` to identify "Own" methods.
- Update `RuntimeService.inspectClass` and `openapi.yaml`.


## Activity Log

- 2026-01-02 @tobiu added the `enhancement` label
- 2026-01-02 @tobiu added the `ai` label
- 2026-01-02 @tobiu added the `performance` label
- 2026-01-02 @tobiu added parent issue #8169

