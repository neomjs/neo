---
id: 8365
title: Integrate Release Index Generation into Release Workflow and Fix SEO Script
state: CLOSED
labels:
  - bug
  - enhancement
  - build
assignees:
  - tobiu
createdAt: '2026-01-06T15:31:22Z'
updatedAt: '2026-01-06T15:36:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8365'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T15:36:20Z'
---
# Integrate Release Index Generation into Release Workflow and Fix SEO Script

Integrate `createReleaseIndex` into the release preparation workflow and fix `generateSeoFiles.mjs` issues.

**Objectives:**
1.  **Workflow Integration:**
    *   Modify `buildScripts/prepareRelease.mjs` to execute `createReleaseIndex` *before* generating SEO files. This ensures the new version is present in `releases.json` when `llms.txt` is generated.
    *   Remove `create-release-index` from `package.json` scripts if it's no longer needed as a standalone command (or keep it for debugging).

2.  **Fix `generateSeoFiles.mjs`:**
    *   **Fix JSON Parsing:** Investigate and fix the "Found releases.json but failed to parse it" warning.
    *   **Fix URL Construction:** Resolve the `ERR_INVALID_URL` error when `baseUrl` is missing. Ensure `getLlmsTxt` handles relative paths gracefully or enforces a `baseUrl`.


## Timeline

- 2026-01-06T15:31:23Z @tobiu added the `bug` label
- 2026-01-06T15:31:23Z @tobiu added the `enhancement` label
- 2026-01-06T15:31:23Z @tobiu added the `build` label
- 2026-01-06T15:32:35Z @tobiu assigned to @tobiu
- 2026-01-06T15:36:09Z @tobiu referenced in commit `50cba68` - "Integrate Release Index Generation into Release Workflow and Fix SEO Script #8365"
- 2026-01-06T15:36:20Z @tobiu closed this issue

