---
id: 8133
title: Fix Webpack build errors in Legit.service.Legit using webpackIgnore
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-17T01:12:11Z'
updatedAt: '2025-12-17T01:14:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8133'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-17T01:14:52Z'
---
# Fix Webpack build errors in Legit.service.Legit using webpackIgnore

The `apps/legit/service/Legit.mjs` service uses dynamic imports for external modules (from `esm.sh`) to keep the initial bundle size low.

```javascript
const {openLegitFs} = await import('https://esm.sh/@legit-sdk/core');
const fsModule      = await import('https://esm.sh/memfs');
```

Webpack attempts to resolve these URLs as local modules or npm packages during the build process, causing the `npm run build-all` command to fail with:
`Error: The target environment doesn't support dynamic import() syntax so it's not possible to use external type 'module' within a script`

**Goal:**
Prevent Webpack from attempting to process these specific import statements so they are handled natively by the browser at runtime.

**Task:**
Modify `apps/legit/service/Legit.mjs` to add `/* webpackIgnore: true */` comments to the dynamic imports.

```javascript
const {openLegitFs} = await import(/* webpackIgnore: true */ 'https://esm.sh/@legit-sdk/core');
const fsModule      = await import(/* webpackIgnore: true */ 'https://esm.sh/memfs');
```

This should resolve the build errors while maintaining the dynamic loading functionality in the browser.

## Timeline

- 2025-12-17T01:12:13Z @tobiu added the `bug` label
- 2025-12-17T01:12:13Z @tobiu added the `ai` label
- 2025-12-17T01:12:39Z @tobiu assigned to @tobiu
- 2025-12-17T01:14:34Z @tobiu referenced in commit `4a904c5` - "Fix Webpack build errors in Legit.service.Legit using webpackIgnore (#8133)"
- 2025-12-17T01:14:52Z @tobiu closed this issue

