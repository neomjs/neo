---
id: 7906
title: Refactor ApiSource hardcoded path to non-reactive config
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-25T17:10:39Z'
updatedAt: '2025-11-25T17:12:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7906'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-25T17:12:28Z'
---
# Refactor ApiSource hardcoded path to non-reactive config

The `ApiSource` class currently uses a hardcoded path `docs/output/all.json` in the `extract` method.
This should be moved to a non-reactive static config `apiPath` to allow for customization via `Neo.overwrites` or subclassing.

**Changes:**
- Add `apiPath: 'docs/output/all.json'` to `ApiSource.config`.
- Update `extract()` method to use `this.apiPath`.

## Timeline

- 2025-11-25T17:10:40Z @tobiu added the `ai` label
- 2025-11-25T17:10:40Z @tobiu added the `refactoring` label
- 2025-11-25T17:10:52Z @tobiu assigned to @tobiu
- 2025-11-25T17:12:15Z @tobiu referenced in commit `384360e` - "Refactor ApiSource hardcoded path to non-reactive config #7906"
- 2025-11-25T17:12:28Z @tobiu closed this issue

