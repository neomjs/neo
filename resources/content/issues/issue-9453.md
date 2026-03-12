---
id: 9453
title: Wire Data Worker Normalizer Execution Pipeline
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T18:23:01Z'
updatedAt: '2026-03-12T18:25:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9453'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Wire Data Worker Normalizer Execution Pipeline

### Goal
Wire the `Normalizer` instantiation to the actual data processing flow within the Data Worker.

### Context
In issue #9450, we implemented the ability to instantiate a `Normalizer` inside the Data Worker using `createInstance()`. It gets successfully stored in `this.instances`, but it never gets invoked during the `Connection -> Parser` flow.

The pipeline must be fully connected so that when a `Connection` executes in the Data Worker, the `Parser` output is routed through the instantiated `Normalizer` before the final array is sent back to the App Worker Store.

### Acceptance Criteria
- Ensure that the Data Worker's fetch/read implementation connects the `Parser` output to the `Normalizer.normalize(data)` method.
- Return the reshaped data (and metadata like `totalCount`) to the App Worker.

## Timeline

- 2026-03-12T18:23:02Z @tobiu added the `enhancement` label
- 2026-03-12T18:23:03Z @tobiu added the `ai` label
- 2026-03-12T18:23:03Z @tobiu added the `architecture` label
- 2026-03-12T18:23:03Z @tobiu added the `core` label
- 2026-03-12T18:23:25Z @tobiu added parent issue #9449
- 2026-03-12T18:24:42Z @tobiu cross-referenced by #9449
- 2026-03-12T18:25:27Z @tobiu assigned to @tobiu

