---
title: Create Script to Automate GitHub Issue Creation from Markdown Ticket
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7367

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 2
**Assignee:** ksanjeev284
**Status:** Done

## Description

The current workflow requires the project maintainer to manually create a GitHub issue after a markdown ticket file has been created. This is a tedious and error-prone step that can be fully automated. This ticket is to create a script that uses the GitHub CLI (`gh`) to read a local ticket file and create a corresponding GitHub issue.

## Acceptance Criteria

1.  Create a new build script (e.g., `buildScripts/ai/createGhIssue.mjs`).
2.  The script must accept the file path to a markdown ticket as an argument.
3.  It should parse the markdown file to extract the `title` from the frontmatter for the GitHub issue title.
4.  It should use the rest of the markdown file's content (excluding frontmatter) as the body for the GitHub issue.
5.  The script will use `gh issue create --title "<title>" --body-file <file>` to create the issue. A temporary file might be needed for the body.
6.  The script should be added to `package.json` as `npm run ai:create-gh-issue`.
