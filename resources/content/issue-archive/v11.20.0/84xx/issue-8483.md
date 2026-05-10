---
id: 8483
title: 'Refine GitHub Release Content: Strip Frontmatter and Use H1 as Title'
state: CLOSED
labels:
  - enhancement
  - ai
  - build
assignees:
  - tobiu
createdAt: '2026-01-09T21:04:29Z'
updatedAt: '2026-01-09T21:09:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8483'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T21:09:12Z'
---
# Refine GitHub Release Content: Strip Frontmatter and Use H1 as Title

The current release workflow simply passes the raw markdown file to `gh release create`. This results in YAML frontmatter appearing in the release body and redundant titles.

We need to update `buildScripts/publishRelease.mjs` to:
1.  Parse the target release note markdown file.
2.  Extract the H1 heading (e.g., `# Neo.mjs v11.19.1 Release Notes`) to use as the GitHub Release Title.
3.  Strip the YAML frontmatter.
4.  Strip the H1 heading from the body content.
5.  Ensure the body starts with the content immediately following the title (e.g., `**Release Type:** ...`).
6.  Generate a temporary cleaned release note file to pass to the `gh` CLI.

## Timeline

- 2026-01-09T21:04:30Z @tobiu added the `enhancement` label
- 2026-01-09T21:04:30Z @tobiu added the `ai` label
- 2026-01-09T21:04:30Z @tobiu added the `build` label
- 2026-01-09T21:08:03Z @tobiu referenced in commit `446f3b1` - "feat: Refine release note parsing in publishRelease (#8483)"
- 2026-01-09T21:08:39Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T21:08:48Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `buildScripts/publishRelease.mjs` to parse the release note markdown file. The script now:
> 1.  Strips YAML frontmatter.
> 2.  Extracts the H1 heading to use as the GitHub Release Title.
> 3.  Uses the remaining body content (without the H1) for the release description.
> 4.  Correctly uses the bare version tag (e.g., `11.19.1`) for the release creation.

- 2026-01-09T21:09:12Z @tobiu closed this issue

