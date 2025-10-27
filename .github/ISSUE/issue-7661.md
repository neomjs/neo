---
id: 7661
title: 'Refine Memory Protocol: Clarify Recovery and Prevent Skipped Turns'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-26T10:33:21Z'
updatedAt: '2025-10-26T10:38:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7661'
author: tobiu
commentsCount: 0
parentIssue: 7604
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-26T10:38:16Z'
---
# Refine Memory Protocol: Clarify Recovery and Prevent Skipped Turns

**Reported by:** @tobiu on 2025-10-26

---

**Parent Issue:** #7604 - Epic: Automate MCP Server Startup and Reduce Agent Protocol

---

This ticket is a follow-up to #7660. It aims to make the memory protocol more resilient by explicitly addressing two key failure modes: technical failures (un-savable turns) and behavioral failures (skipped turns).

**1. Clarify Recovery for "Un-savable Turns":**
The current "Session Recovery Protocol" is robust, but it's not explicitly linked to the scenario where a hard API error aborts a turn before the "Consolidate-Then-Save" step can be reached.

*   **Action:** We will make the connection between the problem and the existing solution explicit.
    1.  Rename the section `### Step 3.1: Session Recovery Protocol` to `### Step 3.1: Protocol for Recovering from Un-savable Turns`.
    2.  Add a preamble to this section that clearly defines an "un-savable turn" and frames the existing recovery procedure as the specific, mandatory remedy for this scenario.

**2. Mitigate "Skipped Turns" (The "Focus Window" Problem):**
This addresses the behavioral issue where an agent "forgets" to save a turn. The existing recovery protocol cannot fix this, as the agent is not even aware it failed.

*   **Action:** We will introduce the concept of a **"Pre-Flight Check"** into the main "Consolidate-Then-Save" protocol. This will serve as a cognitive forcing function.
    1.  A new instruction will be added: Before executing any significant file modification (e.g., `replace`, `write_file`), the agent **MUST** add a "Pre-Flight Check" to its `thought` process, explicitly stating its plan to save the consolidated turn *before* executing the file change.

