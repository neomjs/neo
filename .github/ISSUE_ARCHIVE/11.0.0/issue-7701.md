---
id: 7701
title: 'docs: Strengthen agent protocols for tickets and memory'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-03T13:05:15Z'
updatedAt: '2025-11-03T13:08:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7701'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-03T13:08:08Z'
---
# docs: Strengthen agent protocols for tickets and memory

**Reported by:** @tobiu on 2025-11-03

To improve agent compliance with core operational protocols, this ticket tracks changes to strengthen the "Ticket-First" gate and the "Memory Core" save mandate.

The agent failed to adhere to these rules, modifying files without a ticket and failing to save conversational turns to memory.

The following changes will be implemented:

1.  **In `AGENTS.md`:** An explicit "Pre-Flight Check for Modifications" will be added to the "Ticket-First" Gate section. This forces the agent to verify a ticket exists before using file-writing tools like `replace` or `write_file`.

2.  **In `AGENTS_STARTUP.md`:** The language around saving the initial turn to the memory core will be clarified to explicitly state that this is a mandatory, per-turn action, not a one-time setup step.

These changes are designed to make the protocols more robust and prevent future lapses in agent procedure.

