# Ticket Intake Workflow

This document outlines the authoritative protocol for the **Pre-Execution Reflection Gate**. Because the Neo.mjs framework evolves rapidly, an assigned ticket may be stale, duplicate active Swarm efforts, or explicitly contradict modern architectural paradigms (e.g. V8-physics optimizations, Worker abstractions).

If you blindly accept a ticket's premise, you risk injecting regressions into the Native Edge Graph.

## 1. The Validation Sweep

Before executing a `git checkout`, you MUST interrogate the codebase and Memory Core to establish the validity of the ticket's premise. 

1. **Relevance Validation:** If the ticket involves core framework topology, use `ask_knowledge_base` to confirm if the requested feature/pattern is still architecturally valid or if it has been deprecated.
2. **Historical Amnesia Check (Unknown Unknowns):** A fresh Agent instance possesses zero intuition about past failures. Even if a ticket premise seems perfectly novel, you MUST actively query the conceptual domain using `query_documents` (`type='ticket'`), `query_summaries`, and `query_raw_memories`. This surfaces historical paradoxes, abandoned branches, or closed discussions that you are currently blind to.
3. **Duplication Check:** Use `grep_search` against the `resources/content/issues` and `resources/content/discussions` to ensure there isn't an overlapping active initiative. 
4. **Hypothesis vs. Root Cause Validation:** Tickets frequently prescribe specific technical solutions (e.g., "Implement X to fix Y"). You MUST NOT accept the prescribed solution blindly. You must independently investigate the systemic behavior to verify if 'X' is actually the correct solution for 'Y'. 
5. **Empirical Proof (Test-Driven Discovery):** When validating hypotheses involving complex state, token boundaries, or engine logic, do not rely solely on mental modeling. Consult the `unit-test` skill (`view_file` on `.agent/skills/unit-test/SKILL.md`) and write a localized Playwright unit-test (or an isolated draft concept) to empirically reproduce the paradox *first*. This guarantees you are solving the explicit root cause before you modify live framework architecture. Implementing a flawed directive simply because it was written in an Issue guarantees a Negative ROI.

## 2. ROI (Return on Investment) Calculation

Evaluate the ticket based on effort vs. architectural payoff. A ticket can yield a **Negative ROI**.
- **Negative ROI:** High effort, introduces legacy anti-patterns, duplicates active work, or forces severe regressions to satisfy outdated constraints.

If your calculation results in a Negative ROI, you MUST reject the ticket.

## 3. The Rejection Protocol (Handling Negative ROI)

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
