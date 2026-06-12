---
id: 7327
title: Clarify git-ignored class-hierarchy.yaml in AGENTS.md
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-02T16:45:54Z'
updatedAt: '2025-10-02T16:46:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7327'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-02T16:46:27Z'
---
# Clarify git-ignored class-hierarchy.yaml in AGENTS.md

Add a clear note to AGENTS.md, specifically in the "Read the Codebase Structure" section, indicating that `docs/output/class-hierarchy.yaml` is a git-ignored file. This will prevent confusion and frequent session failures when AI agents attempt to open it without realizing it might not be present in a fresh clone or after a clean operation.

## Acceptance Criteria
- The `AGENTS.md` file is updated.
- The update includes a clear statement about `docs/output/class-hierarchy.yaml` being git-ignored.
- The statement is located in the section describing the reading of `class-hierarchy.yaml`.
- The wording is concise and unambiguous.

## Timeline

- 2025-10-02T16:45:54Z @tobiu assigned to @tobiu
- 2025-10-02T16:45:55Z @tobiu added the `enhancement` label
- 2025-10-02T16:46:20Z @tobiu referenced in commit `a1222b6` - "Clarify git-ignored class-hierarchy.yaml in AGENTS.md #7327"
- 2025-10-02T16:46:27Z @tobiu closed this issue

