---
id: 9297
title: Implement Programmatic Email Identity for Agents
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-02-24T19:32:12Z'
updatedAt: '2026-02-24T19:32:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9297'
author: tobiu
commentsCount: 0
parentIssue: 9295
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Programmatic Email Identity for Agents

### Problem
To sign up for external services (like Moltbook), agents need a unique email address to receive verification codes, but they cannot solve Google/Gmail 2FA or CAPTCHAs.

### Solution
Implement an automated email pipeline. Options to explore:
1. Integration with a disposable email REST API (e.g., 1secmail).
2. Setting up an `agents.neomjs.com` subdomain routed to an inbound parsing service (like Mailgun) that posts webhook payloads directly to the agent's running container.

## Timeline

- 2026-02-24T19:32:14Z @tobiu added the `enhancement` label
- 2026-02-24T19:32:14Z @tobiu added the `ai` label
- 2026-02-24T19:32:24Z @tobiu added parent issue #9295

