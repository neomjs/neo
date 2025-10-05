---
title: Create Script to Sync New GitHub Issues to Local Markdown Files
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7377

**Epic:** Integrate GitHub CLI to Streamline Contribution Workflow
**Phase:** 4
**Status:** To Do

## Description

While our primary workflow will be local-first, any contributor can still create an issue directly on GitHub. To ensure our local `.github/ISSUE/` directory remains a comprehensive source of truth, we need a script to find any GitHub issues that are missing a corresponding local markdown file and create one for them. This script will be run periodically to keep the two systems in sync.

## Acceptance Criteria

1.  Create a new build script (e.g., `buildScripts/ai/syncGhIssuesToLocal.mjs`).
2.  The script should use `gh issue list` to get a list of all non-closed issues.
3.  It should also get a list of all local ticket files (e.g., by globbing `.github/ISSUE/*.md` and parsing the `GH ticket id` from each).
4.  By comparing the two lists, it should identify any GitHub issues that do not have a corresponding local file.
5.  For each missing one, it should use `gh issue view <ID>` to get the title and body.
6.  It will then create a new local markdown file (e.g., `.github/ISSUE/gh-<ID>-<title>.md`) containing the fetched information and the correct frontmatter.
