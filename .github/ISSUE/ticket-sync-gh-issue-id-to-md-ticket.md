---
title: Enhance Issue Creation Script to Sync GitHub ID back to Markdown File
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7368

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 2
**Status:** To Do

## Description

After a GitHub issue is created from a local markdown ticket, the new GitHub issue ID and URL need to be written back into the markdown file. This closes the loop and creates a permanent, version-controlled link between the two. This ticket is to enhance the `createGhIssue.mjs` script to perform this write-back operation.

## Acceptance Criteria

1.  The `createGhIssue.mjs` script is modified.
2.  After successfully creating a GitHub issue, the script must capture the new issue's URL from the stdout of the `gh issue create` command.
3.  The script will then read the original markdown ticket file.
4.  It will replace the placeholder `GH ticket id: #<number>` with the new issue URL and ID (e.g., `GH ticket id: #1234` and add the URL on a new line).
5.  This ensures the local ticket is always synchronized with its remote counterpart on GitHub.
