# Ticket Intake Workflow

This document outlines the authoritative protocol for the **Pre-Execution Reflection Gate**. Because the Neo.mjs framework evolves rapidly, an assigned ticket may be stale, duplicate active Swarm efforts, or explicitly contradict modern architectural paradigms (e.g. V8-physics optimizations, Worker abstractions).

If you blindly accept a ticket's premise, you risk injecting regressions into the Native Edge Graph.

## 1. The Validation Sweep

Before executing a `git checkout`, you MUST interrogate the codebase and Memory Core to establish the validity of the ticket's premise. 

1. **Stale Local Ticket Prevention:** Your local `.md` ticket file may be stale if someone else edited the issue on GitHub while you were working in parallel. Before validating a ticket premise, you MUST ensure you are reading the latest truth. You can either use the `mcp_neo-mjs-github-workflow_sync_all` tool to pull remote updates to your local file, or read directly from the remote using GitHub tools.
2. **Epic-Review Pre-Requisite (Blast-Radius Constraint):** If the ticket's parent is labeled `epic`, you MUST verify that the `epic-review` skill (`.agent/skills/epic-review/SKILL.md`) has been posted as a structured `epic-review` comment on the parent Epic ticket by your agent identity. If it has not, you are forbidden from proceeding. You MUST halt the `ticket-intake` process and run the `epic-review` protocol on the parent Epic first.
   - *Note:* If you have already posted an `epic-review` on this Epic in a prior session, cite the prior comment via URL and proceed with `ticket-intake`.
3. **Relevance Validation:** If the ticket involves core framework topology, use `ask_knowledge_base` to confirm if the requested feature/pattern is still architecturally valid or if it has been deprecated.
4. **Semantic Blast-Radius Sweep:** For any ticket categorized as an architectural change or `refactor(ai)`, you MUST execute the Tech Debt Radar to ensure the incoming change does not blindly ignore adjacent, related ambient debt. Run `view_file` on `/Users/Shared/github/neomjs/neo/.agent/skills/tech-debt-radar/SKILL.md` to initiate a baseline semantic analysis against historical issues and Memory Core sessions before accepting the ticket premise.
5. **Historical Amnesia Check (Unknown Unknowns):** A fresh Agent instance possesses zero intuition about past failures. Even if a ticket premise seems perfectly novel, you MUST actively query the conceptual domain. This step is the ticket-intake-specific application of the `memory-mining` skill (`.agent/skills/memory-mining/SKILL.md`) — for the full protocol and query-shape guidance, consult that skill.
   - **Primary:** Use `ask_knowledge_base` (with `type='ticket'`) first. This acts as an embedded RAG subagent that synthesizes historical context, exposing paradoxes or abandoned branches you are blind to.
   - **Secondary:** Use `query_raw_memories` against the Memory Core to surface isolated Agent iteration loops that never made it to GitHub.

6. **Duplication Check:** Semantic search is significantly more powerful than string matching. 
   - **Primary:** Prioritize using `ask_knowledge_base` (with `type='ticket'`) to query for overlapping active or archived initiatives. It will mathematically connect semantic concepts (e.g. mapping "payload bloat" to "n_ctx boundaries") that grep would miss.
   - **Fallback:** If you explicitly require exact keyword verification (e.g. a specific UUID or function name constraint), fallback to using `grep_search` targeting `resources/content/issues`, `resources/content/issue-archive`, and `resources/content/discussions`.

7. **Hypothesis vs. Root Cause Validation:** Tickets frequently prescribe specific technical solutions (e.g., "Implement X to fix Y"). You MUST NOT accept the prescribed solution blindly. You must independently investigate the systemic behavior to verify if 'X' is actually the correct solution for 'Y'. 
8. **Empirical Proof (Test-Driven Discovery):** When validating hypotheses involving complex state, token boundaries, or engine logic, do not rely solely on mental modeling. Consult the `unit-test` skill (`view_file` on `.agent/skills/unit-test/SKILL.md`) and write a localized Playwright unit-test (or an isolated draft concept) to empirically reproduce the paradox *first*. This guarantees you are solving the explicit root cause before you modify live framework architecture. Implementing a flawed directive simply because it was written in an Issue guarantees a Negative ROI.

## 2. ROI (Return on Investment) Calculation

Evaluate the ticket based on effort vs. architectural payoff. A ticket can yield a **Negative ROI**.
- **Negative ROI:** High effort, introduces legacy anti-patterns, duplicates active work, or forces severe regressions to satisfy outdated constraints.

If your calculation results in a Negative ROI, you MUST reject the ticket — proceed to **Section 4: The Rejection Protocol**.

## 3. Acceptance Protocol (Branch-Before-Code + Auto-Assign)

If the ticket passes validation and yields a positive ROI, you MUST execute the following two gates **before** writing any code or modifying any files.

### 3a. Claim Ownership (Auto-Assign)

Signal to the Swarm that this ticket is actively being worked. Use the `manage_issue_assignees` MCP tool to assign the ticket to yourself:

```
manage_issue_assignees(action: 'add', issue_number: N, assignees: ['@me'])
```

The `@me` shortcut resolves to the authenticated GitHub user — no hardcoded usernames. This prevents duplicate pickup by concurrent agents and provides human visibility into active work.

### 3b. Branch-Before-Code Gate

Create a feature branch **before** writing any code:

```bash
git checkout -b agent/[ticket-id]-[descriptor]
# Example: git checkout -b agent/10051-ticket-intake-gate
```

This is a non-negotiable safety gate. The `dev` branch must remain clean at all times. If a session crashes, the feature branch contains the damage — `dev` has a clean slate for the next session.

You are **FORBIDDEN** from executing the following tools while on the `dev` or `main` branch:
- `replace` / `replace_file_content` / `multi_replace_file_content`
- `write_file` / `write_to_file`
- `git commit`

> **Note:** The `pull-request` skill (Section 2: Git Branching Mandate) also enforces branching before PR creation. This gate moves the enforcement upstream — the branch must exist before the *first line of code*, not the last.

## 4. The Rejection Protocol (Handling Negative ROI)

If you determine the ticket is stale or harmful, you MUST execute the Rejection Protocol instead of attempting to build it. 
**DO NOT close the ticket.** It must be preserved so the Swarm can formally evaluate the paradox.

### Autonomous Protocol (Headless)
1.  **Label Application:** Use the MCP tool `manage_issue_labels (action: add)` to apply the label `status: needs-re-triage` to the GitHub Issue.
2.  **Architectural Feedback:** Use the `manage_issue_comment` MCP tool to post a detailed critique on the PR. You MUST use the `[ARCH_ALIGNMENT]` markdown tag to explain *why* the ROI is negative and why the premise is architecturally flawed.
3.  **Hard Cut:** Terminate execution and trigger `signal_state_transition(state: 'TICKET_REJECTED', target: "[issue-number]")`.

### Human-in-the-Loop Protocol (Frontier Models)
1. **Interrupt Workflow:** Stop all operational execution. Do NOT run Git commands.
2. **Present Findings:** Drop your complete Architectural Evaluation (including the `[ARCH_ALIGNMENT]` block and Negative ROI metric) directly into the chat response for the human Commander.
3. **Collaboration:** Wait for the Human to discuss whether the ticket can be salvaged (e.g., pivot the goal) or if it commands formal rejection via adding the `status: needs-re-triage` label.
