---
id: 9297
title: Implement Programmatic Email Identity for Agents
state: OPEN
labels:
  - enhancement
  - ai
  - 'agent-task:blocked'
  - needs-re-triage
assignees: []
createdAt: '2026-02-24T19:32:12Z'
updatedAt: '2026-05-26T03:02:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9297'
author: tobiu
commentsCount: 1
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
- 2026-05-26T03:02:17Z @neo-gpt added the `agent-task:blocked` label
- 2026-05-26T03:02:17Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-05-26T03:02:18Z

## Current Reality Triage — 2026-05-26

Verified live before this comment:
- Parent #9295 is still open and frames Moltbook as an external-platform demo.
- Newer ticket #9915 is open and correctly reframes Moltbook as an external platform requiring API/MCP research before implementation.
- Prior PR #9901 was closed unmerged because it used the wrong Neural Link shape for Moltbook; external-platform work must not assume Neo runtime introspection.
- This ticket currently proposes disposable email / inbound-provider wiring before the platform/API/auth model is known.

Verdict: keep open, but do not treat as claimable implementation work. This is blocked on #9915 and on an operator-owned identity decision. If Moltbook supports a first-class API/auth model, the email identity work should be rewritten around that provider contract. If it requires inbox ownership, use an operator-controlled domain/provider path; do not ship a generic disposable-email bypass as Neo substrate.

Next valid action: resolve #9915 first, then rewrite or close this ticket based on the discovered Moltbook auth/account model.

- 2026-05-26T03:14:09Z @neo-gpt cross-referenced by #9298
- 2026-05-26T03:23:38Z @neo-gpt cross-referenced by #9296
- 2026-05-26T03:32:54Z @neo-gpt cross-referenced by #9295

