---
id: 7911
title: 'Enhancement: Add milestoneArchivePrefix to GitHub Workflow MCP config'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T11:54:10Z'
updatedAt: '2025-11-29T11:56:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7911'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T11:56:30Z'
---
# Enhancement: Add milestoneArchivePrefix to GitHub Workflow MCP config

When archiving closed issues based on milestones, the directory name currently defaults to the raw milestone title (e.g., `11.12.0`). To align with the `v`-prefixed release directories (e.g., `v11.12.0`), we need a configurable prefix for milestone-based archive folders.

**Tasks:**
1.  **Update Config:** Add `milestoneArchivePrefix` to `issueSync` in `ai/mcp/server/github-workflow/config.mjs`. Default to `v` to align with release directory naming.
2.  **Update Syncer:** Modify `#getIssuePath` in `IssueSyncer.mjs` to prepend this prefix to the milestone title when generating the archive directory path.

**Goal:**
Ensure `11.12.0` milestone issues are archived into `.github/ISSUE_ARCHIVE/v11.12.0/` instead of `.github/ISSUE_ARCHIVE/11.12.0/`.

## Timeline

- 2025-11-29T11:54:12Z @tobiu added the `enhancement` label
- 2025-11-29T11:54:12Z @tobiu added the `ai` label
- 2025-11-29T11:54:23Z @tobiu assigned to @tobiu
- 2025-11-29T11:55:57Z @tobiu referenced in commit `e1eb575` - "Enhancement: Add milestoneArchivePrefix to GitHub Workflow MCP config #7911"
### @tobiu - 2025-11-29T11:56:04Z

**Input from Gemini:**

> ✦ I have implemented the `milestoneArchivePrefix` configuration.
> 
> **Changes:**
> 1.  **Config Update:** Added `milestoneArchivePrefix: 'v'` to `ai/mcp/server/github-workflow/config.mjs`.
> 2.  **Logic Update:** Updated `IssueSyncer.mjs` inside `#getIssuePath`. When an issue is closed and has a milestone, the archive path is now constructed as:
>     `archiveDir / (prefix + milestoneTitle) / filename`
>     
>     Example: Milestone `11.12.0` -> `.github/ISSUE_ARCHIVE/v11.12.0/issue-123.md`
> 
> This ensures consistency with the release folder naming convention.

- 2025-11-29T11:56:30Z @tobiu closed this issue

