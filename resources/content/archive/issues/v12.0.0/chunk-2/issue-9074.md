---
id: 9074
title: 'Epic: Framework-wide Adoption of ''internalId'' for Stable DOM Identity'
state: CLOSED
labels:
  - epic
  - ai
  - refactoring
  - core
assignees:
  - tobiu
createdAt: '2026-02-09T10:51:43Z'
updatedAt: '2026-02-10T00:58:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9074'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 9071 refactor: Adopt ''internalId'' for Stable DOM Keying (List & Data Views)'
  - '[x] 9072 refactor: Adopt ''internalId'' for Stable DOM Keying (Grid & Table)'
  - '[x] 9073 refactor: Ensure Drag & Drop Stability via ''internalId'''
subIssuesCompleted: 3
subIssuesTotal: 3
blockedBy: []
blocking: []
closedAt: '2026-02-10T00:58:35Z'
---
# Epic: Framework-wide Adoption of 'internalId' for Stable DOM Identity

This Epic tracks the systematic refactoring of framework components to utilize the newly implemented `internalId` (#9070) for DOM keying.

**Context:**
The `internalId` feature (#9070) provides a stable, globally unique `neo-record-x` identity for all store items (Records and Raw Objects). Adopting this across the framework will:
1.  **Eliminate "Phantom Record" Issues:** Correctly render new records (`id: null`) without DOM collisions.
2.  **Ensure DOM Stability:** Prevent full re-renders when a record's DB ID changes (e.g. on save).
3.  **Enhance Security:** Decouple DOM IDs from Database IDs.
4.  **Fix Drag & Drop:** Prevent ID collisions when dragging items between stores.

**Implementation Plan:**
Systematic rollout across three key areas:
1.  **List & Data Views:** Base classes for lists, galleries, and helix views.
2.  **Grid & Table:** Container, View, and Row architectures.
3.  **Drag & Drop:** DragZones and DropZones for cross-store operations.

**Child Issues:**
- #9071 (List & Data Views)
- #9072 (Grid & Table)
- #9073 (Drag & Drop)


## Timeline

- 2026-02-09T10:51:45Z @tobiu added the `epic` label
- 2026-02-09T10:51:45Z @tobiu added the `ai` label
- 2026-02-09T10:51:45Z @tobiu added the `refactoring` label
- 2026-02-09T10:51:45Z @tobiu added the `core` label
- 2026-02-09T10:52:02Z @tobiu added sub-issue #9071
- 2026-02-09T10:52:05Z @tobiu added sub-issue #9072
- 2026-02-09T10:52:09Z @tobiu added sub-issue #9073
- 2026-02-09T12:33:55Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-10T00:58:35Z

resolved.

- 2026-02-10T00:58:36Z @tobiu closed this issue

