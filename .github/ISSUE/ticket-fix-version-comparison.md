---
title: "Fix Semantic Version Comparison in HealthService using 'semver'"
labels: bug, AI
---

GH ticket id: #7584

**Epic:** #7564
**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

The `HealthService.#checkGhVersion()` method currently uses string comparison (`>=`) to check if the installed `gh` CLI version meets the minimum requirement. This is a critical bug that breaks for semantic versioning (e.g., "2.9.0" incorrectly compares as greater than "2.10.0").

This will be fixed by incorporating the official `semver` npm package.

## Acceptance Criteria

1.  The `semver` package is added as a `devDependency` to `package.json`.
2.  `npm install` is run to update the `node_modules` directory.
3.  `HealthService.mjs` is updated to import the `semver` package.
4.  The `#checkGhVersion()` method is refactored to use `semver.gte(currentVersion, minVersion)` for the version comparison instead of the incorrect string comparison.
