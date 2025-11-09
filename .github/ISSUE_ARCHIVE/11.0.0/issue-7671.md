---
id: 7671
title: 'Refactor: Polish Agent Protocols in AGENTS.md'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-27T09:05:42Z'
updatedAt: '2025-10-27T10:11:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7671'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-27T10:11:28Z'
---
# Refactor: Polish Agent Protocols in AGENTS.md

**Reported by:** @tobiu on 2025-10-27

Based on feedback from Sonnet 4.5, we need to polish several core protocols within `AGENTS.md` to be more explicit and effective.

This ticket covers the following changes:

### 1. Enhance the Two-Stage Query Protocol

Update the description of Stage 2 to clarify the roles of `query_raw_memories` and `query_summaries`.

**New Text:**
```markdown
2.  **Stage 2: Query for Memory**
    -   **Purpose:** To understand the historical "why."
    -   **Action:** Use memory queries to search your past work:
        -   `query_raw_memories`: Search specific turn-by-turn interactions.
        -   `query_summaries`: Search high-level session summaries for patterns.
        
    **When to use summaries vs. raw memories:**
    - Use `query_summaries` first to find relevant past sessions (faster, high-level).
    - Use `query_raw_memories` to dive into specific implementation details from those sessions.
    
    **Learning from past performance:**
    - Query for similar tasks: "refactoring worker architecture"
    - Check quality/productivity scores to see if you struggled before.
    - Review what worked (high scores) and what failed (low scores).
```

### 2. Add Explicit Pre-Flight Check Triggers

Make the Pre-Flight Check protocol more explicit with clear triggers.

**New Text:**
```markdown
**Pre-Flight Check Triggers:**

You **MUST** execute a Pre-Flight Check before calling any of these tools:
- `replace` (modifying file content)
- `write_file` (creating or overwriting files)
- `run_shell_command` (when the command modifies repository state)
- Any other tool that changes files in the repository

The Pre-Flight Check consists of explicitly stating in your internal thought process:
"Pre-Flight Check: Before executing [TOOL_NAME], I will save the consolidated turn after completion."

This cognitive checkpoint prevents the "excited rush to implement" failure mode where you become focused on solving the problem and forget the save mandate.
```

### 3. Soften "CRITICAL" Language

In the Session Initialization section, adjust the tone for the config system explanation.

**Old Text:**
> CRITICAL: You must deeply understand the difference between reactive configs...

**New Text:**
> - The `static config` system: Understanding the difference between **reactive configs** (e.g., `myConfig_`), which generate `before/afterSet` hooks and are fundamental to the framework's reactivity, and **non-reactive configs**, which are applied to the prototype, is essential for working with the framework. The trailing underscore is the key indicator.

### 4. Clarify Memory Core Activation

Add more context to the Memory Core check in the Session Initialization section.

**New Text:**
> 6.  **Check for Memory Core:** At the beginning of your session, you **MUST** check if the Memory Core is active by using the `healthcheck` tool for the `neo.mjs-memory-core` server.
    -   **If the healthcheck is successful:** The Memory Core is active. You **MUST** use the `add_memory` tool to save every turn. This creates a queryable history of your work that enables learning from past sessions and pattern recognition across time.
    -   **If the healthcheck fails:** The Memory Core is not active. Proceed with the session without using memory tools. Your work will not be persisted for future analysis.
```

