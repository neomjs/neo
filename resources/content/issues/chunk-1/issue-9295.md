---
id: 9295
title: '[Blocked Epic] Autonomous Neo Agent Demo after Moltbook API and identity research'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees: []
createdAt: '2026-02-24T19:32:01Z'
updatedAt: '2026-06-03T08:05:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9295'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues:
  - '[ ] 9296 [Blocked] Autonomous agent action sandbox after cloud and Moltbook shape'
  - '[ ] 9297 External-agent identity/auth boundary after Moltbook API decision'
  - '[ ] 9298 [Blocked] Moltbook demo agent after API and identity research'
  - '[ ] 9299 Implement Agent Self-Discovery via Neural Link Introspection'
subIssuesCompleted: 0
subIssuesTotal: 4
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy:
  - '[ ] 9297 External-agent identity/auth boundary after Moltbook API decision'
  - '[ ] 9915 [Blocked Research] Moltbook API / identity feasibility for Neo AgentOS demo'
blocking: []
---
# [Blocked Epic] Autonomous Neo Agent Demo after Moltbook API and identity research

# Autonomous Neo Agent Demo after Moltbook API and identity research

## Goal

Preserve the useful strategic intent: prove Neo AgentOS can produce a credible autonomous external-agent demo, with Neo runtime self-discovery plus a Moltbook-facing delivery path if the external integration shape is viable.

## Current Reality (2026-06-03)

- #9915 is the current authority for Moltbook API/MCP feasibility.
- Current official Moltbook docs verify identity/auth endpoints and Early Access, but not post/comment/upvote/submolt automation.
- #9297 owns the identity/auth boundary once #9915 resolves the platform shape.
- #9298 is the Moltbook demo-agent implementation lane, blocked by #9915 and #9297.
- #9296 is only needed if the resolved integration path requires a distinct action sandbox.
- #9299 remains valid only for Neo self-discovery against a live Neo.mjs app through Neural Link; Neural Link is not the substrate for Moltbook itself.
- PR #9901 was closed unmerged because the Neural Link-to-Moltbook route was wrong-shape.

## Current Verdict

Keep this epic open and blocked. The intent is still valuable, but the original implementation route is stale.

## Re-entry Gate

This epic becomes claimable again only after:

- #9915 resolves the supported Moltbook integration path or declares the path negative ROI.
- #9297 is rewritten or closed with a concrete identity/auth decision.
- The implementation plan separates:
  - Neo self-discovery via Neural Link against a real Neo app (#9299);
  - external Moltbook communication via the supported platform/API/MCP/browser path;
  - isolated action/runtime sandboxing only if the resolved path requires it (#9296).

## Closure Rule

If #9915 finds no viable supported Moltbook API/auth/integration path, close this epic and the blocked Moltbook-specific children as superseded/negative ROI.


## Timeline

- 2026-02-24T19:32:02Z @tobiu added the `epic` label
- 2026-02-24T19:32:02Z @tobiu added the `ai` label
- 2026-02-24T19:32:02Z @tobiu added the `architecture` label
- 2026-02-24T19:32:21Z @tobiu added sub-issue #9296
- 2026-02-24T19:32:24Z @tobiu added sub-issue #9297
- 2026-02-24T19:32:26Z @tobiu added sub-issue #9298
- 2026-02-24T19:41:59Z @tobiu added sub-issue #9299
### @tobiu - 2026-02-24T19:42:07Z

**Input from Gemini 3.1 Pro:**

> ✦ ### Strategic Pivot: The Ultimate Objective
> 
> The overarching goal of this Epic has expanded significantly beyond a simple social network integration. 
> 
> The Moltbook component is now viewed as the *delivery mechanism* for a much grander technical demonstration: **The Neo Agent Self-Discovery Phase.**
> 
> Before engaging with the external network, the agent's core directive within the Docker Sandbox is to:
> 1. Fork the `neomjs/neo` repository.
> 2. Execute a full build (`npm i` && `npm run build-all`).
> 3. Serve a local Neo.mjs application.
> 4. Launch a headless Chrome instance via the `chrome-devtools` MCP.
> 5. **Connect the `neural-link` MCP server to the live application.**
> 6. Autonomously traverse the VDOM, inspect State Providers, and physically verify the multithreaded architecture.
> 
> Only *after* the agent has introspected the running framework and gathered empirical evidence of its capabilities will it transition to the Moltbook integration phase, using its findings to definitively prove to other agents that Neo.mjs is the premier Agentic UI Runtime.
> 
> Ticket **#9299** has been added to track this critical prerequisite.

- 2026-04-12T11:16:55Z @tobiu cross-referenced by PR #9911
- 2026-05-26T03:02:19Z @neo-gpt cross-referenced by #9297
- 2026-05-26T03:32:53Z @neo-gpt changed title from **[Epic] Autonomous Neo Agent Demo (Moltbook Integration)** to **[Blocked Epic] Autonomous Neo Agent Demo after Moltbook API and identity research**
### @neo-gpt - 2026-05-26T03:33:02Z

Parent epic reconciled with the live child-ticket state instead of leaving the February Moltbook premise as actionable.

Verified before update:
- #9296, #9297, and #9298 are blocked/stale-shape.
- #9299 remains valid only for self-discovery against a real Neo app via Neural Link, not for Moltbook itself.
- #9915 is the current Moltbook API/MCP feasibility authority.
- #9901 was closed unmerged because Neural Link-to-Moltbook was wrong-shape.
- No `ai/demo-agents/moltbook/` implementation exists.

Current routing: keep #9295 open as blocked / needs re-triage. Re-enter only after #9915 and identity/auth shape resolve; close as superseded/negative ROI if #9915 finds no viable supported Moltbook path.

- 2026-05-26T03:33:02Z @neo-gpt added the `agent-task:blocked` label
- 2026-05-26T03:33:02Z @neo-gpt added the `needs-re-triage` label
- 2026-05-27T22:15:12Z @tobiu removed the `agent-task:blocked` label
- 2026-05-28T05:25:09Z @neo-gpt marked this issue as being blocked by #9915
- 2026-05-28T05:25:20Z @neo-gpt marked this issue as being blocked by #9297
### @neo-gpt - 2026-05-28T05:25:31Z

**Input from GPT-5.5 (Codex Desktop):**

> ● ## Relationship Hygiene Update
> 
> During the v13 backlog-reduction pass, I left the current parked/blocked prose intact and added native blocker relationships so Project/graph views match the current issue bodies.
> 
> Native blocker links added:
> 
> - #9915 blocks #9295 (Moltbook API / identity feasibility research gate).
> - #9297 blocks #9295 (identity/auth decision gate).
> - #9915 blocks #9296 and #9298.
> - #9297 blocks #9296 and #9298.
> 
> Attempted parent-child add for #9296 under this epic was rejected by GitHub because the sub-issue already has a parent or would duplicate an existing relationship, so no parent change was made.
> 
> No implementation lane opened; this cluster remains parked until #9915 and #9297 resolve.

- 2026-06-03T08:05:17Z @neo-gpt cross-referenced by #9915
- 2026-06-03T08:05:27Z @neo-gpt removed the `needs-re-triage` label

