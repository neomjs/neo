---
id: 9595
title: Fix TypeError in Portal Ticket Component when Markdown frontmatter labels is a string
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-03-29T18:53:50Z'
updatedAt: '2026-03-29T19:33:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9595'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-29T19:33:18Z'
---
# Fix TypeError in Portal Ticket Component when Markdown frontmatter labels is a string

When fetching ticket `.md` files that have unquoted single labels in their frontmatter (like `labels: bug` instead of `labels: [bug]`), the `neo.mjs` Portal `<Ticket>` component's `modifyMarkdown` method throws a `TypeError: labels.forEach is not a function`.

This blocks SSG processes trying to generate all tickets statically. The extracted `labels` should be type-checked and cast to an array if necessary.

## Timeline

- 2026-03-29T18:53:51Z @tobiu added the `bug` label
- 2026-03-29T18:53:51Z @tobiu added the `ai` label
- 2026-03-29T19:32:59Z @tobiu referenced in commit `0fc99f9` - "fix: Fix TypeError in Portal Ticket Component (#9595)"
- 2026-03-29T19:33:14Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-29T19:33:16Z

Fix committed and pushed to `dev`.

- 2026-03-29T19:33:18Z @tobiu closed this issue

