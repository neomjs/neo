---
id: 7584
title: Fix Semantic Version Comparison in HealthService using 'semver'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T13:47:47Z'
updatedAt: '2025-10-20T13:55:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7584'
author: tobiu
commentsCount: 0
parentIssue: 7564
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-20T13:55:11Z'
---
# Fix Semantic Version Comparison in HealthService using 'semver'

**Reported by:** @tobiu on 2025-10-20

---

**Parent Issue:** #7564 - Epic: Implement Two-Way GitHub Synchronization for Issues

---

The `HealthService.#checkGhVersion()` method currently uses string comparison (`>=`) to check if the installed `gh` CLI version meets the minimum requirement. This is a critical bug that breaks for semantic versioning (e.g., "2.9.0" incorrectly compares as greater than "2.10.0").

This will be fixed by incorporating the official `semver` npm package.

## Acceptance Criteria

1.  The `semver` package is added as a `devDependency` to `package.json`.
2.  `npm install` is run to update the `node_modules` directory.
3.  `HealthService.mjs` is updated to import the `semver` package.
4.  The `#checkGhVersion()` method is refactored to use `semver.gte(currentVersion, minVersion)` for the version comparison instead of the incorrect string comparison.

