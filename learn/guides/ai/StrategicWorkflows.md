# AI Strategic Workflows

This guide is primarily written for the AI agent, providing strategic context for its operational protocols. However, it is also a valuable resource for human developers to understand the advanced, integrated workflows that the agent is capable of, and to learn best practices for repository and issue management that maximize the agent's effectiveness.

This guide is a "cookbook" of advanced strategies. It provides examples of how to combine the agent's core tools (`git`, `ai:query`, `ai:query-memory`) to solve complex problems. While `AGENTS.md` defines the mandatory *rules* of your operation, this guide provides the strategic *art*.

## The Regression Bug Analysis Workflow

One of the most powerful use cases for the agent is analyzing and fixing regression bugs. A naive fix might solve the immediate bug but re-introduce the original problem that the previous code was trying to solve. This workflow prevents that by building a complete, three-dimensional picture of the code's history and intent.

### The Goal

To fix a regression not just by reverting code, but by understanding the *intent* of the original change and creating a new solution that honors both the old and new requirements.

### The Steps

1.  **Isolate the Regression:** Start with a clear identification of the regression. What worked before but is now broken?

2.  **Find the Breaking Commit (`git`):** Use `git log` and `git blame` on the affected file(s) to pinpoint the exact commit that introduced the regression.

3.  **Find the Original Task (`ai:query`):** The commit message for the breaking change should contain a ticket number or a clear description of the original task. Use this information to query the knowledge base for the original ticket.
    ```bash
    npm run ai:query -- -q "#<ticket_number>" -t ticket
    ```
    Reading the ticket will tell you the *planned* work.

4.  **Find the Unwritten Context (`ai:query-memory`):** This is the most critical step. The ticket describes the plan, but the memory core holds the conversation, the debates, the alternative approaches, and the specific user constraints that shaped the final implementation. Query your memory using the ticket number or key phrases from the original discussion.
    ```bash
    npm run ai:query-memory -- -q "context for ticket #<ticket_number>"
    ```
    This query reveals the crucial **"why"** behind the code that is now causing a regression.

5.  **Synthesize and Solve:** With the full context, you can now devise a solution that addresses the new regression while still respecting the original problem that the previous developer (or a past version of yourself) was trying to solve. Your final plan should explicitly reference the synthesis of these three sources of information:
    *   **What changed?** (from `git`)
    *   **What was the plan?** (from the knowledge base)
    *   **What was the intent?** (from your memory)
