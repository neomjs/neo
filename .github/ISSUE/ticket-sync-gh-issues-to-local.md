---
title: Create Script to Sync New GitHub Issues to Local Markdown Files
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7377

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 4
**Assignee:** LemonDrop847
**Status:** To Do


## Description

While our primary workflow will be local-first, any contributor can still create an issue directly on GitHub. To ensure our local `.github/ISSUE/` directory remains a comprehensive source of truth, we need a script to find any GitHub issues that are missing a corresponding local markdown file and create one for them. This script will be run periodically to keep the two systems in sync.

**To ensure consistency, this script should reuse the file-writing and formatting logic from the existing `buildScripts/ai/createGhIssue.mjs` script. This will likely require refactoring shared utility functions into a common module.**

## Acceptance Criteria

1.  Helper functions from `createGhIssue.mjs` (such as for filename generation and metadata prepending) are refactored into a shared utility module (e.g., `buildScripts/ai/util/ticketUtils.mjs`).
2.  Create a new build script (`buildScripts/ai/syncGhIssuesToLocal.mjs`).
3.  The script should use `gh issue list` to get a list of all non-closed issues.
4.  It should also get a list of all local ticket files (e.g., by globbing `.github/ISSUE/*.md` and parsing the `GH ticket id` from each).
5.  By comparing the two lists, it should identify any GitHub issues that do not have a corresponding local file.
6.  For each missing one, it should use `gh issue view <ID>` to get the title and body.
7.  It will then create a new local markdown file (e.g., `.github/ISSUE/gh-<ID>-<title>.md`) using the refactored utility functions to ensure consistent formatting.
