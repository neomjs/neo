---
id: 9418
title: Create Data Normalizer Architecture (`Neo.data.normalizer.Base` & `Tree`)
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T15:45:18Z'
updatedAt: '2026-03-09T15:47:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9418'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Data Normalizer Architecture (`Neo.data.normalizer.Base` & `Tree`)

### Goal
Introduce a `Neo.data.normalizer.Base` class and a concrete `Neo.data.normalizer.Tree` implementation to decouple geometric data shaping from Stores and Parsers.

### Context
In our modernized data pipeline (`Connection -> Parser -> Normalizer -> Store`), the **Normalizer** is responsible for taking native JavaScript objects (yielded by a Parser) and reshaping them for the Store. For the Tree Grid epic, external APIs often return nested hierarchical data, while `Neo.data.TreeStore` requires a flattened 1D array with `parentId` relationships.

### Acceptance Criteria
- Create `src/data/normalizer/Base.mjs` defining the standard interface for structural normalization and metadata extraction (like `totalCount`).
- Create `src/data/normalizer/Tree.mjs`. This normalizer must take a nested JS object array (e.g., `children` properties), recursively flatten it into a 1D array, and inject `parentId` links before passing the data to the `TreeStore`.
- Update `Store` configs to accept a `normalizer` property.

### Dependencies
- Belongs to the TreeGrid Epic (#9404).

## Timeline

- 2026-03-09T15:45:20Z @tobiu added the `enhancement` label
- 2026-03-09T15:45:20Z @tobiu added the `ai` label
- 2026-03-09T15:45:21Z @tobiu added the `architecture` label
- 2026-03-09T15:45:21Z @tobiu added the `core` label
- 2026-03-09T15:45:33Z @tobiu added parent issue #9404
- 2026-03-09T15:46:36Z @tobiu cross-referenced by #9420
- 2026-03-09T15:46:59Z @tobiu assigned to @tobiu
- 2026-03-12T14:20:26Z @tobiu cross-referenced by #9449
- 2026-03-12T14:21:14Z @tobiu removed parent issue #9404
- 2026-03-12T14:21:15Z @tobiu added parent issue #9449

