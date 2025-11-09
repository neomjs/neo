---
id: 7648
title: 'Feat: Improve Agent Comment Formatting with Markdown Headings'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T15:53:23Z'
updatedAt: '2025-10-25T15:54:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7648'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-25T15:54:31Z'
---
# Feat: Improve Agent Comment Formatting with Markdown Headings

**Reported by:** @tobiu on 2025-10-25

This ticket describes an enhancement to the agent comment formatting within the `PullRequestService`.

**Problem:**
Previously, when an agent comment started with a markdown heading (e.g., `#`, `##`, `###`), the agent icon was prepended *before* the heading markers, resulting in an awkward format like `> ✦ ### Review: Approved`.

**Solution:**
The `createComment` method in `PullRequestService.mjs` has been adjusted to intelligently place the agent icon *after* the markdown heading markers but *before* the heading text. This results in a more visually appealing and semantically correct format, such as `### ✦ Review: Approved`. The entire comment is then correctly blockquoted.

**Changes Implemented:**
The `createComment` method in `ai/mcp/server/github-workflow/services/PullRequestService.mjs` was modified to include logic for detecting markdown headings and inserting the agent icon at the appropriate position.

This ensures that agent comments are consistently well-formatted, improving readability and adherence to markdown conventions.

