---
id: 7721
title: 'Docs: Create and integrate guide for `gh`-absent scenarios'
state: OPEN
labels:
  - documentation
  - ai
assignees: []
createdAt: '2025-11-08T09:56:33Z'
updatedAt: '2025-11-08T09:56:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7721'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# Docs: Create and integrate guide for `gh`-absent scenarios

**Reported by:** @tobiu on 2025-11-08

A new guide is needed to document how to reproduce and handle scenarios where the GitHub CLI (`gh`) is absent. This involves:
1.  Moving the content from `ai/mcp/server/github-workflow/docs/gh-absent.md` to a new file inside `learn/guides/ai/`.
2.  The new filename must be descriptive and in `PascalCase`, for example: `GitHubWorkflowServerGhAbsent.md`.
3.  The new guide must be added to `learn/tree.json` under the "AI" section to make it visible in the documentation portal.

