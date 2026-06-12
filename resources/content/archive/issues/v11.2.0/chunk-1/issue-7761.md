---
id: 7761
title: Refactor `resolveContentFileFromId` in `generateSeoFiles.mjs` for accurate content path resolution
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-12T15:28:44Z'
updatedAt: '2025-11-12T20:55:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7761'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-12T20:55:18Z'
---
# Refactor `resolveContentFileFromId` in `generateSeoFiles.mjs` for accurate content path resolution

The `resolveContentFileFromId` function within `buildScripts/generateSeoFiles.mjs` is responsible for mapping `id`s from `learn/tree.json` to actual content files on disk. The current implementation includes a `nestedCandidates` logic that attempts to find `README` or `index` files within directories corresponding to `tree.json` `id`s.

This `nestedCandidates` logic appears to be an incorrect assumption or a "hallucination" as the `tree.json` `id`s are designed to provide direct paths to content files (e.g., `benefits/Effort` should map to `learn/benefits/Effort.md`). The current approach can lead to incorrect file resolution or unnecessary complexity.

**Acceptance Criteria:**
1.  **Simplify `resolveContentFileFromId`**: Remove the `nestedCandidates` logic from `resolveContentFileFromId`.
2.  **Direct Path Resolution**: The function should directly resolve content file paths by combining `LEARN_DIR`, the `id` (split into segments), and iterating through `SUPPORTED_DOC_EXTENSIONS`.
3.  **Accurate Extension Handling**: Ensure that the function correctly appends the appropriate file extension (e.g., `.md`, `.json`) to the `id` to find the corresponding content file.
4.  **Validation**: Verify that all `id`s in `learn/tree.json` correctly resolve to their respective content files after the refactoring.

## Timeline

- 2025-11-12T15:28:46Z @tobiu added the `bug` label
- 2025-11-12T15:28:46Z @tobiu added the `ai` label
- 2025-11-12T15:28:46Z @tobiu added the `refactoring` label
- 2025-11-12T20:54:21Z @tobiu assigned to @tobiu
- 2025-11-12T20:55:10Z @tobiu referenced in commit `5a84395` - "Refactor resolveContentFileFromId in generateSeoFiles.mjs for accurate content path resolution #7761"
- 2025-11-12T20:55:19Z @tobiu closed this issue

