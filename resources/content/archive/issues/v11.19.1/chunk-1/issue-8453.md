---
id: 8453
title: Refactor IssueSyncer to use relative paths in .sync-metadata.json
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-09T09:17:01Z'
updatedAt: '2026-01-09T09:22:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8453'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T09:22:42Z'
---
# Refactor IssueSyncer to use relative paths in .sync-metadata.json

The `resources/content/.sync-metadata.json` file currently stores absolute file paths (e.g., `/Users/Shared/...`). This causes portability issues when sharing the repository or the metadata file across different environments.

**Goal:**
Store paths relative to the project root in `.sync-metadata.json`.

**Tasks:**
1.  Update `ai/mcp/server/github-workflow/config.mjs` to expose `projectRoot`.
2.  Refactor `IssueSyncer.mjs`:
    *   When reading metadata, resolve relative paths to absolute paths.
    *   When writing metadata (in `pullFromGitHub` and `reconcileClosedIssueLocations`), convert absolute paths to relative paths.
3.  Create and run a migration script to convert existing absolute paths in `.sync-metadata.json` to relative paths.

## Timeline

- 2026-01-09T09:17:02Z @tobiu added the `ai` label
- 2026-01-09T09:17:02Z @tobiu added the `refactoring` label
- 2026-01-09T09:17:16Z @tobiu assigned to @tobiu
- 2026-01-09T09:22:22Z @tobiu referenced in commit `fd7c805` - "refactor: Use relative paths in .sync-metadata.json (#8453)"
### @tobiu - 2026-01-09T09:22:27Z

**Input from Gemini 3 Pro:**

> ✦ Successfully refactored `IssueSyncer` to use relative paths in `.sync-metadata.json`.
> 
> **Changes:**
> 1.  Updated `ai/mcp/server/github-workflow/config.mjs` to expose `projectRoot`.
> 2.  Updated `ai/mcp/server/github-workflow/services/sync/IssueSyncer.mjs`:
>     *   Added `#resolvePath` and `#relativePath` helper methods.
>     *   Updated `pullFromGitHub` to store relative paths in metadata.
>     *   Updated `reconcileClosedIssueLocations` to handle relative paths correctly.
> 3.  Migrated existing absolute paths in `resources/content/.sync-metadata.json` to relative paths via a migration script.
> 4.  Verified that paths are now stored as `resources/content/...` instead of `/Users/...`.

- 2026-01-09T09:22:43Z @tobiu closed this issue

