---
id: 7246
title: Create Class Hierarchy YAML
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-24T08:50:16Z'
updatedAt: '2025-09-24T08:50:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7246'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-24T08:50:59Z'
---
# Create Class Hierarchy YAML

The current `docs/output/structure.json` file is too large and inefficient for AI agent consumption. To provide a lean but effective overview of the project's class structure, we will create a new build artifact.

## Goal

Modify the `buildScripts/docs/jsdocx.mjs` script to generate a new file at `docs/output/class-hierarchy.yaml`.

### Requirements:

1.  **Format:** The file must be in YAML.
2.  **Content:** It will contain a simple key-value mapping of `className: parentClassName`.
3.  **Sorting:** The entries must be sorted alphabetically by the `className` (the key).
4.  **Implementation:** This will be done within the existing `jsdocx.mjs` script, leveraging the already-parsed documentation data.
5.  **Agent Integration:** Update `AGENTS.md` to instruct the agent to parse `docs/output/class-hierarchy.yaml` instead of the old `structure.json` file.

## Timeline

- 2025-09-24T08:50:16Z @tobiu assigned to @tobiu
- 2025-09-24T08:50:17Z @tobiu added the `enhancement` label
- 2025-09-24T08:50:55Z @tobiu referenced in commit `d24d22c` - "Create Class Hierarchy YAML #7246"
- 2025-09-24T08:50:59Z @tobiu closed this issue

