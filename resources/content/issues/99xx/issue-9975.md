---
id: 9975
title: Hardening Agent Intake via Empirical Verification & Historical Domain Querying
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-13T14:57:51Z'
updatedAt: '2026-04-13T22:31:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9975'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T15:12:00Z'
---
# Hardening Agent Intake via Empirical Verification & Historical Domain Querying

### Architectural Paradox
Currently, the `ticket-intake` skill relies on "agent intuition" (e.g., asking "didn't we try this before?") to trigger historical verification against the Memory Core. However, fresh Swarm instances suffer from "Zero-State Amnesia" and inherently lack intuition. Additionally, agents tend to blindly accept prescribed architectural solutions within tickets instead of isolating the true root cause, leading to Negative ROI.

### Resolution
This ticket formalizes two systemic mandates across the Neo.mjs Agent OS:
1. **Historical Amnesia Check (Unknown Unknowns):** Agents MUST explicitly perform a blind domain query (`query_documents`, `query_summaries`, `query_raw_memories`) against the Memory Core regardless of how novel a ticket seems.
2. **Empirical Proof (Test-Driven Discovery):** Agents MUST explicitly validate technical hypotheses by writing localized Playwright tests via the `unit-test` skill *before* mutating live architecture.

### Definition of Done
- Update `.agent/skills/ticket-intake/references/ticket-intake-workflow.md` with the new Historical Amnesia (Unknown Unknowns) and Empirical Proof mandates.
- Update `.agent/skills/pull-request/references/pull-request-workflow.md` to require missing unit tests as a pre-commit block for "Minor Gaps".

## Timeline

- 2026-04-13T14:57:52Z @tobiu added the `enhancement` label
- 2026-04-13T14:57:53Z @tobiu added the `ai` label
- 2026-04-13T14:58:05Z @tobiu referenced in commit `3434a85` - "docs: harden agent intake and validation mandates (#9975)"
- 2026-04-13T14:58:08Z @tobiu cross-referenced by PR #9976
- 2026-04-13T15:12:00Z @tobiu referenced in commit `7bae914` - "docs: harden agent intake and validation mandates (#9975) (#9976)

* docs: harden agent intake and validation mandates (#9975)

* docs: formalize semantic duplication sweeps including issue-archive

* docs: establish ask_knowledge_base as primary RAG subagent for domain sweep"
- 2026-04-13T15:12:00Z @tobiu closed this issue
- 2026-04-13T22:31:56Z @tobiu assigned to @tobiu

