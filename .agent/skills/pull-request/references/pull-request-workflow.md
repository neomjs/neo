# Pull Request Workflow

This document outlines the authoritative protocol for structuring and executing Pull Requests within the Neo.mjs project. **This protocol applies to all agents, including headless autonomous sub-agents.**

By consolidating the PR creation logic here, we prevent our agents from falling into tactical loops and enforce architectural reflection before any code is merged.

## 1. The "Stepping Back" Reflection Protocol (Pre-Commit Gate)

The act of opening a PR is an irreversible state transition in the Agent OS. Before executing `git commit` and `gh pr create`, you MUST step back from the tactical implementation and assume the persona of an Architect.

In your internal monologue (thought process), explicitly answer the following:
1.  **Did I fall into a tactical loop?** Did I just apply multiple iterative bandages to a file without fixing the architectural root cause?
2.  **Are there major architectural gaps?** If so, and they are out of scope for the current ticket, DO NOT attempt to scope-creep them into this PR. Instead, formally acknowledge them in the PR body and propose a **Follow-Up System Enhancement Ticket**.
3.  **Is my Context complete?** Does the code perfectly satisfy the 'Anchor & Echo' Knowledge Base Enhancement Strategy? (No undocumented configs or missing `@summary` tags).

*If and only if* you pass this reflection phase, proceed to the Git execution sequence.

## 2. Git Branching Mandate

You are strictly forbidden from committing or pushing directly to `main` (release-only) or `dev` (default working). 
If you are still on `dev`, you MUST branch off:

```bash
git checkout -b agent/[ticket-id]-[descriptor]
# Example: git checkout -b agent/9957-pull-request-skill
```

## 3. Commit Sequence

Your commit messages MUST follow Conventional Commits and MUST append the ticket ID so that the GitHub API and our internal memory cores can track outcomes.

1.  Stage your files: `git add [file paths]`
2.  Commit the changes:
    ```bash
    git commit -m "feat/fix/chore: Your descriptive message (#TICKET_ID)"
    ```
3.  Push the branch to remote:
    ```bash
    git push origin [branch-name]
    ```

## 4. Pull Request Creation

You MUST use the GitHub CLI to open a Pull Request targeting the `dev` branch.

```bash
gh pr create --fill --base dev
```
*(The `--fill` flag automatically uses your commits to populate the PR details. If you need to add custom context, e.g., explicitly stating `Resolves #TICKET_ID` or dropping `Origin Session ID` telemetry, use the `manage_issue_comment` MCP tool to add a comment immediately after creation).*

## 5. Definition of Done & The Handoff State

The agent's task is strictly considered "Done" once the PR is opened. A PR is a request for validation by an external entity (Human or QA Agent). **An agent MUST NOT autonomously run the `pr-review` skill against its own PR in headless mode.** 

**Iterative Polish (Pre-PR):** Autonomous agents must act as their own harshest critic *before* the handoff. Get the codebase to the best possible state. If you identify minor gaps (missing JSDoc, logical edge cases) during your reflection, you MUST push follow-up polish commits to your branch *prior* to executing the final PR creation.

You MUST follow this exact handoff protocol:

1. **Autonomous Protocol (Headless):** Immediately after the PR is successfully opened, you MUST invoke the state transition trap to terminate the swarm intelligence loop:
   `signal_state_transition(state: 'PR_OPENED', target: "[pr-number]")`

2. **Human-in-the-Loop Protocol (Frontier Models):** Once the PR is opened, you MUST halt and await human QA. **DO NOT** execute `gh pr merge` yourself. You may ask the human Commander: *"PR opened. Shall I execute the `pr-review` skill to assist with your evaluation?"* but you must not proceed without explicit consent.
