---
id: 9418
title: Create Data Normalizer Architecture (`Neo.data.normalizer.Base` & `Tree`)
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-09T15:45:18Z'
updatedAt: '2026-03-12T14:45:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9418'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-12T14:45:52Z'
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
- 2026-03-12T14:43:45Z @tobiu referenced in commit `ebeec39` - "feat: Create Data Normalizer Architecture (#9418)"
### @tobiu - 2026-03-12T14:45:15Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the new `Neo.data.normalizer.Base` and `Neo.data.normalizer.Tree` architecture as requested.
> 
> ### Changes Made:
> - **`src/data/normalizer/Base.mjs`**: Created the base class that defines the `normalize(data)` interface to handle structural reshaping and metadata extraction.
> - **`src/data/normalizer/Tree.mjs`**: Created a specific implementation that traverses hierarchical JSON structures based on a `childrenProperty`, flattens the tree into a 1D array, and injects `parentId` and `isLeaf` data natively. Memory optimization is also applied by removing the raw nested `children` arrays since the TreeStore uses `#childrenMap`.
> - **`src/data/Store.mjs`**: Added the `normalizer_` reactive config.
> - **`test/playwright/unit/data/normalizer/Tree.spec.mjs`**: Added a test suite that successfully tests single objects, basic flattening, structural injection (`isLeaf`, `parentId`), custom configurations (`childrenProperty`, `keyProperty`), and the extraction of `totalCount`.
> 
> Tests executed and all 331 unit tests pass flawlessly.
> 
> The code has been committed and pushed under `#9418`.

- 2026-03-12T14:45:52Z @tobiu closed this issue

