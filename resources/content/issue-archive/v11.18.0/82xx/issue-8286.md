---
id: 8286
title: Enhance DomAccess.getElement to support window and document targets
state: CLOSED
labels:
  - enhancement
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-01-02T10:50:32Z'
updatedAt: '2026-01-02T11:05:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8286'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-02T11:04:31Z'
---
# Enhance DomAccess.getElement to support window and document targets

**Context:**
The `DomAccess.getElement()` method currently supports retrieving elements by ID or data attribute.
For advanced event simulation (Neural Link), we need to dispatch events to `window` and `document` as well.

**Proposed Change:**
Enhance `src/main/DomAccess.mjs` `getElement(id)` to support reserved keywords:
- `'window'` -> returns `globalThis` (window)
- `'document'` -> returns `document`
- `'document.body'` -> returns `document.body`

**Benefit:**
Provides a single source of truth for DOM node resolution across the framework, avoiding duplicate logic in addons.


## Timeline

- 2026-01-02T10:50:34Z @tobiu added the `enhancement` label
- 2026-01-02T10:50:34Z @tobiu added the `core` label
- 2026-01-02T10:50:50Z @tobiu added the `ai` label
- 2026-01-02T10:51:02Z @tobiu added parent issue #8169
- 2026-01-02T11:04:31Z @tobiu closed this issue
- 2026-01-02T11:05:05Z @tobiu assigned to @tobiu
- 2026-01-04T03:10:29Z @jonnyamsp referenced in commit `48f9a47` - "enhancement(main): Enhance DomAccess.getElement to support window, document and body targets. Resolves #8286"

