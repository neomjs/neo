---
id: 8363
title: Create Build Script for Release Notes JSON Index
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-06T15:08:45Z'
updatedAt: '2026-01-06T15:19:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8363'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T15:19:05Z'
---
# Create Build Script for Release Notes JSON Index

Create a node script `buildScripts/generateReleaseNotes.mjs` that parses the markdown files in `.github/RELEASE_NOTES` and generates a JSON index at `apps/portal/resources/data/releases.json`.

This is a prerequisite for the Portal News section refactor.

The script should:
1.  Scan `.github/RELEASE_NOTES/*.md`.
2.  Extract metadata (version, date, title) using `gray-matter` or fallback to file parsing.
3.  Sort releases by version (descending).
4.  Output the JSON file.


## Timeline

- 2026-01-06T15:08:46Z @tobiu added the `enhancement` label
- 2026-01-06T15:08:47Z @tobiu added the `ai` label
- 2026-01-06T15:08:47Z @tobiu added the `build` label
- 2026-01-06T15:18:03Z @tobiu assigned to @tobiu
- 2026-01-06T15:18:47Z @tobiu referenced in commit `2a84b7d` - "Create Build Script for Release Notes JSON Index #8363"
- 2026-01-06T15:19:05Z @tobiu closed this issue

