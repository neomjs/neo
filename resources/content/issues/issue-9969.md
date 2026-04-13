---
id: 9969
title: '[Agent OS] Scaffold ''ticket-intake'' Progressive Disclosure Skill'
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-13T13:11:09Z'
updatedAt: '2026-04-13T13:31:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9969'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T13:31:43Z'
---
# [Agent OS] Scaffold 'ticket-intake' Progressive Disclosure Skill

### 🎯 Objective
Create a new Progressive Disclosure skill (`ticket-intake`) to explicitly govern how agents ingest and validate existing GitHub tickets before beginning execution.

### 🧠 Architectural Rationale
Our PR generation pipeline is now secured against tactical loops, but our intake pipeline remains vulnerable to "Blind Execution". Since Neo.mjs evolves at an extreme pace, historical or externally submitted tickets easily go stale, duplicate existing efforts, or contradict modern architectural paradigms. 

If an autonomous swarm agent blindly accepts a ticket's premise, it will write regressions. We need a mandatory **Pre-Execution Reflection Gate**.

### 📋 Scope
1. Scaffold `.agent/skills/ticket-intake/SKILL.md` (triggered whenever a new ticket is assigned or selected).
2. Author the reference payload to mandate:
    - **Relevance Validation:** Query the Memory Core and Knowledge Base to ensure the requested feature/fix is still architecturally valid.
    - **Duplication Check:** Traverse the active Native Edge Graph to identify colliding active tickets.
    - **Rejection Protocol:** Empower the agent to aggressively reject the ticket. Document the exact workflow to formally reject the premise, post an Architectural explanation comment, and automatically close the issue rather than coding a regression.
3. Update `AGENTS.md` (Section 6: Request Triage) to point to this lazy-loaded skill, enforcing it for Frontier Models.

## Timeline

- 2026-04-13T13:11:10Z @tobiu added the `enhancement` label
- 2026-04-13T13:11:11Z @tobiu added the `ai` label
- 2026-04-13T13:18:19Z @tobiu referenced in commit `077bf0b` - "feat: scaffold ticket-intake progressive disclosure skill for agent state validation (#9969)"
- 2026-04-13T13:24:02Z @tobiu cross-referenced by PR #9970
- 2026-04-13T13:27:28Z @tobiu cross-referenced by #9971
- 2026-04-13T13:31:43Z @tobiu referenced in commit `d25b33a` - "feat: scaffold ticket-intake progressive disclosure skill for agent state validation (#9969) (#9970)

* feat: scaffold ticket-intake progressive disclosure skill for agent state validation (#9969)

* fix: explicitly forbid '--fill' during PR creation to mandate architectural ticket bodies"
- 2026-04-13T13:31:43Z @tobiu closed this issue
- 2026-04-13T13:45:42Z @tobiu cross-referenced by PR #9972

