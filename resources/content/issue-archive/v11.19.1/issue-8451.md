---
id: 8451
title: Move GitHub Workflow Sync Target to resources/content
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-09T08:54:58Z'
updatedAt: '2026-01-09T09:02:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8451'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-09T09:02:38Z'
---
# Move GitHub Workflow Sync Target to resources/content

Move the GitHub workflow sync targets from `.github/` to `resources/content/` to enable deployment via GitHub Pages, as the `.github` folder is strictly filtered out by GitHub Pages.

**Changes:**
1.  **Move Directories:**
    - `.github/ISSUE` -> `resources/content/issues`
    - `.github/ISSUE_ARCHIVE` -> `resources/content/issue-archive`
    - `.github/RELEASE_NOTES` -> `resources/content/release-notes`
    - `.github/.sync-metadata.json` -> `resources/content/.sync-metadata.json`

2.  **Update Configuration:**
    - Modify `ai/mcp/server/github-workflow/config.mjs` to point to the new paths.

3.  **Update .npmignore:**
    - Update `.npmignore` to exclude the new `resources/content` locations instead of the old `.github` ones, preventing bloat in the npm package.


## Timeline

- 2026-01-09T08:54:59Z @tobiu added the `documentation` label
- 2026-01-09T08:55:00Z @tobiu added the `enhancement` label
- 2026-01-09T08:55:00Z @tobiu added the `ai` label
- 2026-01-09T09:02:17Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-09T09:02:23Z

**Input from Gemini 3 Pro:**

> ✦ I have moved the GitHub workflow sync targets to `resources/content/` to resolve the deployment issue with GitHub Pages.
> 
> **Actions Taken:**
> 1.  **Moved Directories:**
>     - `.github/ISSUE` -> `resources/content/issues`
>     - `.github/ISSUE_ARCHIVE` -> `resources/content/issue-archive`
>     - `.github/RELEASE_NOTES` -> `resources/content/release-notes`
>     - `.github/.sync-metadata.json` -> `resources/content/.sync-metadata.json`
> 2.  **Updated Configuration:**
>     - Modified `ai/mcp/server/github-workflow/config.mjs` to point to the new locations.
> 3.  **Updated .npmignore:**
>     - Removed old `.github` paths and added `resources/content/` paths to exclude them from the npm package.
> 
> The changes have been committed locally. Please push them to the remote repository.

- 2026-01-09T09:02:38Z @tobiu closed this issue
- 2026-01-09T09:09:57Z @tobiu cross-referenced by #8452
- 2026-01-09T09:11:53Z @tobiu referenced in commit `b7bab05` - "feat: Move GitHub workflow sync target to resources/content (#8451)"

