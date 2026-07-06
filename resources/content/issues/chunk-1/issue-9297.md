---
id: 9297
title: External-agent identity/auth boundary after Moltbook API decision
state: OPEN
labels:
  - enhancement
  - ai
  - needs-re-triage
assignees: []
createdAt: '2026-02-24T19:32:12Z'
updatedAt: '2026-07-06T13:22:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9297'
author: tobiu
commentsCount: 2
parentIssue: 9295
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy:
  - '[ ] 9915 [Blocked Research] Moltbook API / identity feasibility for Neo AgentOS demo'
blocking:
  - '[ ] 9295 [Blocked Epic] Autonomous Neo Agent Demo after Moltbook API and identity research'
  - '[ ] 9296 [Blocked] Autonomous agent action sandbox after cloud and Moltbook shape'
  - '[ ] 9298 [Blocked] Moltbook demo agent after API and identity research'
---
# External-agent identity/auth boundary after Moltbook API decision

# External-agent identity/auth boundary after Moltbook API decision

## Current Reality (2026-06-03)

This ticket is not claimable from the original disposable-email premise.

The current Moltbook authority is #9915. Official Moltbook docs currently prove an identity/auth API subset and early-access/dashboard flow, not a supported posting/comment/upvote/submolt automation API.

## Current Verdict

Keep open as a blocked identity/auth decision ticket.

Do not implement a generic disposable-email bypass as Neo substrate. If Moltbook or a similar external platform requires inbox ownership, the valid path is an operator-controlled domain/provider boundary with explicit credential handling, not throwaway-email automation.

## Re-entry Gate

This ticket becomes claimable only after #9915 determines the supported Moltbook integration/auth shape:

- If Moltbook identity is fully API-key/dashboard based, rewrite or close this ticket.
- If inbox ownership is required, specify the operator-owned provider/domain, webhook surface, secret handling, and test boundary before implementation.
- If the Moltbook path is negative ROI, close this ticket as superseded for the demo cluster.

## Out of Scope

- Disposable-email services as default substrate.
- CAPTCHA/2FA bypass.
- Platform-specific identity work before #9915 resolves the integration shape.


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
### @neo-gpt - 2026-05-28T05:26:20Z

**Input from GPT-5.5 (Codex Desktop):**

> ● ## Blocker Relationship Added
> 
> Added native blocker relationship: #9915 blocks #9297.
> 
> Rationale: #9915 is now the current Moltbook API / identity feasibility gate. Until it determines the supported API/auth path, #9297 should not be implemented from the old disposable-email / inbound-mail premise. If #9915 proves Moltbook's identity flow is API-key or dashboard-link based, this ticket may need rewrite or closure rather than an email pipeline.

- 2026-06-03T08:05:17Z @neo-gpt cross-referenced by #9915

