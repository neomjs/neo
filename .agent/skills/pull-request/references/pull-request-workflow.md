# Pull Request Workflow

This document outlines the authoritative protocol for structuring and executing Pull Requests within the Neo.mjs project. **This protocol applies to all agents, including headless autonomous sub-agents.**

By consolidating the PR creation logic here, we prevent our agents from falling into tactical loops and enforce architectural reflection before any code is merged.

## 1. The "Stepping Back" Reflection Protocol (Pre-Commit Gate)

The act of opening a PR is an irreversible state transition in the Agent OS. Before executing the final `git commit` and `gh pr create`, you MUST step back from the tactical implementation and assume the persona of an Architect.

**Scope Creep vs. Iteration:** You must explicitly "think outside the box" and challenge your initial tactical assumptions:
- **Minor Gaps:** If your reflection uncovers minor misses (e.g., missed JSDoc, missing Anchor & Echo context, logical edge cases, or missing unit tests validating new logic), you MUST fix them and add rapid successive commits to your local branch to polish the execution *before* opening the PR.
- **Major Refactors:** If you realize a mathematically superior architecture exists (e.g., massive GC optimization) that is *out-of-scope* for the current ticket, DO NOT attempt to scope-creep and cram it into the active branch. Secure the "good enough" execution, and instead formally propose a **Follow-Up System Enhancement Ticket** conceptually linked to the original.

*If and only if* you pass this reflection phase, proceed to the Git execution sequence.

## 2. Git Branching Mandate

You are strictly forbidden from committing or pushing directly to `main` (release-only) or `dev` (default working). The *mechanism* for satisfying this rule differs by harness class.

### 2.1 Worktree-isolated harnesses (e.g., Claude Code)

Claude Code and similar harnesses create a git worktree per session at `.claude/worktrees/<name>/` on an auto-generated branch. Git's worktree branch-exclusivity mechanically prevents accidental commits to `main`/`dev` — another worktree already holds those branches, and git refuses to share.

Any non-`main`/`dev` branch name is acceptable, including harness-generated defaults like `claude/goofy-tu-f83d87`. No explicit branching action is required — the harness already satisfies the mandate.

### 2.2 Shared-checkout harnesses (e.g., Gemini CLI, Antigravity)

Harnesses without worktree isolation operate directly inside the main checkout's working tree. The first `git commit` without an explicit branch lands on the currently checked-out branch — typically `dev`, which is a protocol violation.

You MUST branch off *before* any code change:

```bash
git checkout -b agent/[ticket-id]-[descriptor]
# Example: git checkout -b agent/9957-pull-request-skill
```

> **Note:** If you followed the `ticket-intake` skill (Section 3: Acceptance Protocol), the feature branch should already exist.

### 2.3 Universal safety net

Regardless of harness class, before your first commit verify:

```bash
git branch --show-current
```

If it returns `main` or `dev`, STOP and branch off using the §2.2 procedure. This check costs nothing and catches edge cases where a harness's isolation assumption has broken (e.g. symlink detach, manual `git checkout`).

## 3. Commit Sequence

Your commit messages MUST follow Conventional Commits and MUST append the ticket ID so that the GitHub API and our internal memory cores can track outcomes.

### 3.1 Type Selection

- **`feat`** — the change unlocks a new capability that did not exist before. Harness integrations, new workflows, new tooling surfaces, and any agent- or user-facing feature all fall here.
- **`fix`** — restores broken behavior. Use when a regression, race condition, or incorrect output is being corrected.
- **`chore`** — pure maintenance with zero behavioral or capability delta. Dependency bumps, auto-generated syncs, typo fixes, and similar housekeeping only.

Decision rule: *"Does this enable a new capability that did not exist before?"* → `feat`. When ambiguous, default to `feat`; `chore` is the narrowest category.

### 3.2 Commit Message Hygiene

- **FORBIDDEN:** `Co-Authored-By: <name> <noreply@*>` footers. Some AI harnesses (notably Claude Code) inject these by default — you MUST override that behavior. Agent participation is tracked via the linked ticket body, PR labels (`ai`, `ai-generated`), and Memory Core origin-session IDs, not via fake git identities in commit trailers.
- **MANDATORY:** append the ticket ID to the subject line in `(#TICKET_ID)` form — e.g. `feat(claude): wire harness (#10059)`. A trailing paragraph like `Refs #N` is non-compliant. The `Resolves #N` keyword belongs in the PR body, not the commit.

### 3.3 Steps

1.  Stage your files: `git add [file paths]`
2.  Commit the changes:
    ```bash
    git commit -m "type(scope): descriptive message (#TICKET_ID)"
    ```
3.  Push the branch to remote:
    ```bash
    git push origin [branch-name]
    ```

## 4. Pull Request Creation

You MUST use the GitHub CLI to open a Pull Request targeting the `dev` branch. You are strictly forbidden from using the `--fill` flag, as it bypasses the generation of a comprehensive PR body.

```bash
gh pr create --title "feat/fix/chore: Your Title (#TICKET_ID)" --body "Comprehensive markdown body explaining architectural impact, edge cases, and explicitly stating Resolves #TICKET_ID" --base dev
```
*(Passing the body directly ensures the PR contains the required context and aligns with the "Fat Ticket" protocol.)*

## 5. Definition of Done & The Handoff State

The agent's task is strictly considered "Done" once the PR is opened. A PR is a request for validation by an external entity (Human or QA Agent). **An agent MUST NOT autonomously run the `pr-review` skill against its own PR in headless mode.** 

**Iterative Polish (Pre-PR):** Autonomous agents must act as their own harshest critic *before* the handoff. Get the codebase to the best possible state. If you identify minor gaps (missing JSDoc, logical edge cases) during your reflection, you MUST push follow-up polish commits to your branch *prior* to executing the final PR creation.

You MUST follow this exact handoff protocol:

1. **Autonomous Protocol (Headless):** Immediately after the PR is successfully opened, you MUST invoke the state transition trap to terminate the swarm intelligence loop:
   `signal_state_transition(state: 'PR_OPENED', target: "[pr-number]")`

2. **Human-in-the-Loop Protocol (Frontier Models):** Once the PR is opened, you MUST halt and await human QA. **DO NOT** execute `gh pr merge` yourself. You may ask the human Commander: *"PR opened. Shall I execute the `pr-review` skill to assist with your evaluation?"* but you must not proceed without explicit consent.
