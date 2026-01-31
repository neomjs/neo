---
id: 8924
title: 'Feat: Support nested property paths in get_instance_properties'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-01-31T15:20:36Z'
updatedAt: '2026-01-31T15:20:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8924'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Support nested property paths in get_instance_properties

Enhance `get_instance_properties` to support dot-notation for accessing nested properties on an instance.

**Current Behavior:**
`properties: ['store']` returns the Store ID (if instance) or object.
To get the count, a second call is needed: `inspect_store` or `get_instance_properties` on the store ID.

**New Behavior:**
Support `properties: ['store.count', 'layout.align', 'view.style.color']`.

**Implementation:**
Update `Neo.ai.client.InstanceService` to traverse the object graph using a `Neo.ns`-like helper for each requested property path.

**Benefit:**
Enables agents to retrieve deep state (e.g. "Why is the grid empty?" -> check `store.filters`) in a single roundtrip without needing `eval`.

## Timeline

- 2026-01-31T15:20:37Z @tobiu added the `enhancement` label
- 2026-01-31T15:20:37Z @tobiu added the `ai` label

