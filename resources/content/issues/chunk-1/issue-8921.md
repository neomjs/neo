---
id: 8921
title: 'Feat: Implement Neo.ai.Chat (Reference UI)'
state: CLOSED
labels:
  - stale
  - ai
  - feature
assignees: []
createdAt: '2026-01-31T14:13:13Z'
updatedAt: '2026-05-16T04:46:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8921'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[x] 8920 Feat: Implement Neo.component.markdown.VDom (VDOM-Native Parsing)'
blocking: []
closedAt: '2026-05-16T04:46:09Z'
---
# Feat: Implement Neo.ai.Chat (Reference UI)

Create a reference implementation of a Modern AI Chat Interface to demonstrate the capabilities of the new `markdown.VDom` component.

**Features:**
1.  **Streaming:** Connect to a mock stream to demonstrate smooth text appending.
2.  **Typing Effect:** Implement a "Typing Buffer" that linearizes bursty network packets into a smooth visual flow (e.g., 1 char/10ms).
3.  **Auto-Scroll:** Robust "stick-to-bottom" logic that respects user scroll intent.
4.  **Architecture:** Use the `markdown.VDom` component to ensure 60fps rendering even during heavy streams.

## Timeline

- 2026-01-31T14:13:15Z @tobiu added the `ai` label
- 2026-01-31T14:13:15Z @tobiu added the `feature` label
- 2026-01-31T14:13:24Z @tobiu marked this issue as blocking #8920
- 2026-01-31T14:15:36Z @tobiu removed the block on #8920
- 2026-01-31T14:16:33Z @tobiu marked this issue as being blocked by #8920
### @github-actions - 2026-05-02T04:34:25Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-05-02T04:34:25Z @github-actions added the `stale` label
### @github-actions - 2026-05-16T04:46:09Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2026-05-16T04:46:09Z @github-actions closed this issue

