---
id: 9747
title: Enhance Golden Path with issue titles in sandman_handoff
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T20:05:38Z'
updatedAt: '2026-04-06T20:42:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9747'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T20:12:41Z'
---
# Enhance Golden Path with issue titles in sandman_handoff

### Description
`DreamService` currently outputs the Golden Path node priorities into the `sandman_handoff.md` file using only their literal issue IDs (e.g. `issue-123`). 
        
To improve human readability, the service should parse the node's internal JSON `properties` and inject the node's `title` so developers can understand the priorities at a glance without having to guess what the issue IDs relate to.

## Timeline

- 2026-04-06T20:05:41Z @tobiu added the `enhancement` label
- 2026-04-06T20:05:41Z @tobiu added the `ai` label
- 2026-04-06T20:12:40Z @tobiu referenced in commit `ffc7f1a` - "feat: enhance Golden Path handoff output with semantic issue titles (#9747)"
- 2026-04-06T20:12:41Z @tobiu closed this issue
- 2026-04-06T20:42:34Z @tobiu assigned to @tobiu

