---
id: 7816
title: Fix Webpack critical dependency warning in HighlightJs dynamic import
state: CLOSED
labels:
  - bug
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-19T17:25:25Z'
updatedAt: '2025-11-19T17:27:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7816'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-19T17:27:04Z'
---
# Fix Webpack critical dependency warning in HighlightJs dynamic import

Webpack throws a "Critical dependency" warning in `src/util/HighlightJs.mjs` because of a dynamic import using a variable path:

```javascript
let path   = Neo.config.basePath + 'dist/highlight/highlight.custom' + (this.debug ? '' : '.min') + '.js',
    module = await import(path);
```

This is a valid use case for loading a runtime library. To fix the build warning, we need to instruct Webpack to ignore this specific import.

**Solution:**
Add `/* webpackIgnore: true */` to the import statement in `src/util/HighlightJs.mjs`.

```javascript
module = await import(/* webpackIgnore: true */ path);
```

## Timeline

- 2025-11-19T17:25:26Z @tobiu added the `bug` label
- 2025-11-19T17:25:26Z @tobiu added the `refactoring` label
- 2025-11-19T17:26:31Z @tobiu assigned to @tobiu
- 2025-11-19T17:26:54Z @tobiu referenced in commit `e72c5da` - "Fix Webpack critical dependency warning in HighlightJs dynamic import #7816"
- 2025-11-19T17:27:04Z @tobiu closed this issue

