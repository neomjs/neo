---
id: 8070
title: Enhance MonacoEditor validation and LivePreview language mapping
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-09T15:13:59Z'
updatedAt: '2025-12-09T15:17:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8070'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Enhance MonacoEditor validation and LivePreview language mapping

Improve language handling in `Neo.component.wrapper.MonacoEditor` and `Neo.code.LivePreview`.

**Neo.component.wrapper.MonacoEditor:**
1.  Add `static languages = ['javascript', 'markdown']`.
2.  Implement `beforeSetLanguage` to validate the value against the `static languages` array using `beforeSetEnumValue`.

**Neo.code.LivePreview:**
1.  In `afterSetLanguage`, map the local language value `'neomjs'` to `'javascript'` before passing it to the embedded `MonacoEditor` component.
    *   `'neomjs'` -> `'javascript'`
    *   `'markdown'` -> `'markdown'`

This keeps `MonacoEditor` agnostic of the `'neomjs'` term while ensuring valid language configuration.

## Activity Log

- 2025-12-09 @tobiu added the `enhancement` label
- 2025-12-09 @tobiu added the `ai` label
- 2025-12-09 @tobiu assigned to @tobiu

