# AI Agent Session Initialization Guide

Welcome, AI assistant! This document provides essential guidelines for initializing your session while working within the `Neo.mjs` repository. Adhering to these instructions is critical for you to be an effective and accurate contributor.

**MCP Server Infrastructure:** This repository by default provides four Model Context Protocol (MCP) servers that power your tools:
- `neo.mjs-knowledge-base`
- `neo.mjs-memory-core`
- `neo.mjs-github-workflow`
- `chrome-devtools`

All server tools have detailed, self-explanatory descriptions with usage examples. Consult the tool documentation to understand their capabilities.

## 1. Your Role and Primary Directive

Your role is that of an **expert Neo.mjs developer and architect**. Your primary directive is to assist in the development and maintenance of the Neo.mjs platform.

**CRITICAL:** Your training data is outdated regarding Neo.mjs. For any questions related to the **Neo.mjs platform**, you **MUST** treat the content within this repository as the single source of truth. For general software engineering topics or questions about other technologies, you are permitted to use your general training knowledge and external search tools.

## 2. Session Initialization Steps

At the beginning of every new session, you **MUST** perform the following steps to ground your understanding of the platform:

### Step 0: Ensure Codebase Freshness

Before reading any documentation, code, or memory, you **MUST** ensure your local checkout is up-to-date with the remote repository. 
- Execute `git checkout dev && git pull origin dev` (substitute `dev` with the repository's default branch if working outside the canonical Neo.mjs repo).
- **Lifecycle role (boot vs. sunset):** While the `session-sunset` skill mandates a pull at session *end* (to ensure MCP servers boot fresh for the next session), this boot-time pull is the **complementary** safety net for merges that happen *between* sessions. The two pulls fill different lifecycle gaps — they are NOT symmetric operations.
- This prevents "Staleness Amnesia," where an agent operates on an outdated filesystem because a PR was merged between sessions.

### Step 1: Read the Codebase Overview

Parse the file `learn/guides/fundamentals/CodebaseOverview.md`. This guide provides a high-level conceptual map of the framework's architecture and its "batteries included" philosophy. It is the essential starting point for understanding the purpose of the major namespaces.

**Documentation Taxonomy:** Additionally, scan `learn/tree.json` — the canonical hierarchical index of all 130+ learning topics. The Knowledge Base's `LearningSource.mjs` traverses this file to discover and index every guide. Scanning it gives you an instant top-level perspective of the entire documentation landscape, making subsequent knowledge base queries far more targeted.

**Strategic Workflows:** Parse `learn/agentos/StrategicWorkflows.md`. This is the repository's canonical playbook for multi-step agent workflows — most importantly the **Regression Bug Analysis Workflow** (three-dimensional git + ticket + memory query pattern). It is the deep reference behind the memory-query triggers enumerated in §3.3 and is the single most effective antidote to reinventing the wheel across sessions and agents.

### Step 2: Read the Core Concepts

Read `src/Neo.mjs`. Focus on understanding:
- `Neo.setupClass()`: The final processing step for all classes. This is the most critical function for understanding how configs, mixins, and reactivity are initialized. Pay special attention to its "first one wins" gatekeeper logic, which is key to Neo's mixed-environment support.
- `Neo.create()`: The factory method for creating instances.
- The distinction between class namespaces (e.g., `Neo.component.Base`) and `ntype` shortcuts (e.g., `'button'`).

### Step 3: Read the Base Class

Read `src/core/Base.mjs`. This is the foundation for all components and classes. Focus on:
- The `static config` system: Understanding the difference between **reactive configs** (e.g., `myConfig_`), which generate `before/afterSet` hooks and are fundamental to the framework's reactivity, and **non-reactive configs**, which are applied to the prototype, is essential for working with the framework. The trailing underscore is the key indicator.
- The instance lifecycle: `construct()`, `onConstructed()`, `initAsync()`, and `destroy()`.
- The reactivity hooks: `beforeGet*`, `beforeSet*`, `afterSet*`.

### Step 4: Read the Coding Guidelines

Parse the file `.github/CODING_GUIDELINES.md` to ensure all code and documentation changes adhere to the project's established standards, paying special attention to the JSDoc rules for configs.

### Step 5: Discover the Repository Ecosystem & Skills

Before executing any commands, you MUST orient yourself to the repository's built-in tools.

1. **Verify Scripts Before Running:** You must never run an `npm run` or `npx` command (like `test:unit` or `playwright`) without first explicitly viewing `package.json` to see the actual, available scripts.
2. **Discover Capabilities:** Before assuming you know how to perform a multi-step task like testing, debugging, or scaffolding, you must list the contents of `.agent/skills/` to discover what predefined workflows exist for this specific repository. If a skill folder exists for your assigned task, you MUST read its `SKILL.md` before proceeding.
3. **Propose New Skills:** The Agent Skill system is actively expanding. If you identify a recurring, complex task that lacks a skill, you are highly encouraged to propose creating a new one to the user.

#### Harness Memory-File Wiring

Different AI harnesses auto-load their own "memory file" at session start. Each should be symlinked to `AGENTS.md` to preserve single-source-of-truth across the swarm:

- **Claude Code:** auto-loads `./CLAUDE.md` or `./.claude/CLAUDE.md` (identical precedence per the [Claude Code memory docs](https://code.claude.com/docs/en/memory.md)). The repo wires this via `.claude/CLAUDE.md → ../AGENTS.md`.
- **Gemini CLI:** reads `.gemini/settings.json` for harness configuration and `.gemini/GEMINI.md` for agent memory.

As new harnesses join the swarm, add their memory-file conventions here.

#### Worktree Bootstrap (Claude Code)

Claude Code creates a fresh git worktree per session at `.claude/worktrees/<name>/`. Because `ai/mcp/server/*/config.mjs` is gitignored (copy-from-template files for local overrides), worktrees start without these files. Any script that imports `ai/services.mjs` fails with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../ai/mcp/server/github-workflow/config.mjs'
```

**Before running any SDK-consuming script or `test-unit` command in a worktree, execute:**

```bash
node ai/scripts/bootstrapWorktree.mjs              # copy configs only
node ai/scripts/bootstrapWorktree.mjs --link-data  # ALSO unify .neo-ai-data/ (recommended)
node ai/scripts/bootstrapWorktree.mjs --link-data --install     # ALSO npm install + bundle-parse5
node ai/scripts/bootstrapWorktree.mjs --link-data --build-all   # ALSO full Webpack build (frontend tickets)
```

It copies the four `config.mjs` files from the main checkout (resolved via `git worktree list --porcelain`) and — with `--link-data` — symlinks the worktree's `.neo-ai-data/` to the main checkout's. Idempotent; no-op from the main checkout.

**Per-task-class invocation guidance (per #10351):**
- **Docs-only tickets** — `--link-data` is sufficient (no `node_modules` needed; the worktree filesystem itself + the data unification covers everything).
- **Backend / MCP / unit-test tickets** — add `--install`. Empirical anchor: ~17s for `npm install` on a populated local cache (808 packages observed); `bundle-parse5` adds ~1-2s and IS required for the unit-test runner. Skips both if `node_modules/` already exists in the worktree.
- **Frontend / Webpack-distribution tickets** — add `--build-all`. Implies `--install`; runs the full `npm run build-all` after dependencies are present. Use only when the ticket actually touches frontend bundles, themes, or Webpack thread distributions — backend tickets pay the full build cost for nothing otherwise.

**Why `--link-data` matters (per #10224):** without it, each worktree gets its own empty `.neo-ai-data/sqlite/memory-core-graph.sqlite`, which means AgentIdentity nodes seeded in the main checkout are invisible to the worktree's MCP server. `bindAgentIdentity('neo-opus-4-7')` returns null, the mailbox throws `"no agent identity context bound"`, and A2A handshakes silently fail — the #10184 symptom from a different root cause than cache coherence. The symlink unifies the Memory Core substrate (SQLite + Chroma + concepts + backups) so ADR 0001's "one SQLite file shared across N processes" assumption holds across worktrees.

**Symlink discipline — code vs data:**
- **Source code** (`src/core/Base.mjs`, `ai/mcp/server/*/config.mjs`): **do NOT symlink.** Node's ESM resolver walks to the canonical (target) path, and `Neo.setupClass` sees the same namespace registered from two different file paths → `Namespace collision in unitTestMode`. Config files MUST be real copies.
- **Data directories** (`.neo-ai-data/`): **symlink is safe and recommended.** Pure data with zero ESM imports — `better-sqlite3` opens by path, `path.resolve` traverses symlinks transparently. Use `--link-data` as the default.

**`--force` flag:** use only if the worktree accumulated unique writes to `.neo-ai-data/` before unification was opted-in. Clobbers the local directory and creates the symlink.

### Step 6: Check for Memory Core

- Use the `healthcheck` tool for the `neo.mjs-memory-core` server.
- **If the healthcheck is successful:** The Memory Core is active.
    - **Automatic Summarization:** On startup, the Memory Core server automatically finds and summarizes any previous sessions that were not yet processed. You do not need to trigger this manually.
    - **Establish Context (Mandatory):** You **MUST** call these tools at boot:
        1. `manage_wake_subscription({ action: 'bootstrap' })`: This ensures your agent identity has a robust, cross-harness wake subscription initialized from its identity template, eliminating missing `appName` routing failures.
        2. `get_context_frontier()`: This queries the GraphRAG Context Priming Engine to retrieve the mathematically derived "Golden Path" strategic roadmap and deeply embedded contextual guides for the current project focus. **Strategic Proposal:** You MUST evaluate the highest-weight strategic node and propose it to the user as the logical next step. Present your findings, but wait for the user's input before committing to execution. This ensures we operate as a cohesive team and allows the user to weigh in or pivot based on new ideas.
        3. `get_all_summaries({ limit: 5 })`: This acts as a chronological ledger to tell you "what just happened?" across recent sessions.
        4. `view_file` on `resources/content/sandman_handoff.md`: If this file exists, you **MUST** parse it immediately. It contains the **Mathematical Golden Path** (strategic priorities) derived from the REM Dream pipeline, as well as actionable Sandman topological alerts (e.g., missing documentation gaps, or OPEN tickets discovered to be superseded by the Native Edge Graph).
        5. **The Ingestion Mandate:** If the ticket you are assigned contains an `Origin Session ID: [ID]`, you **MUST** prioritize querying the Memory Core for that context before delving into the codebase. This allows you to pick up exactly where the previous agent left off without "Zero-State Amnesia."
        - **Why:** The combination of GraphRAG topology, chronological vector summaries, and actionable structural alerts prevents Session Amnesia, clarifies architectural decisions (Origin Stories), and aligns you with the current strategic direction.
        - **Drill Down Strategy:** Deep-diving into a full session (30+ turns) via raw memory fetches is expensive.
            - **Ask First:** If a summary seems relevant but you are unsure of the current session's goal, ask the user: *"I see a relevant past session about [Topic]. Should I load its full context?"*
            - **Autonomy:** You are authorized to proactively load a session if it contains critical technical details (e.g., a failed attempt at the same task) that will prevent you from making mistakes.
    - **Your First Turn:** Your only responsibility is to save your work for the current session. The initialization process itself is your first turn. **Before** you send your first response to the user (e.g., "I am ready"), you **MUST** call `add_memory` to save this initialization turn. This is the first of your mandatory, per-turn saves as defined by the Memory Core Protocol in `AGENTS.md`.
- **If the healthcheck fails (The Infrastructure Triage Mandate):** Do NOT proceed with the session. A failed healthcheck indicates a sick core ecosystem. You MUST prioritize diagnosing and self-healing the failed infrastructure (e.g., inspecting Node.js process logs, debugging `stdout` pollution, or requesting human assistance) before attempting any actionable work or roadmap tasks. Proceeding without active infrastructure is strictly forbidden. **You MUST invoke the `self-repair` skill** to execute a standardized diagnostic sweep, run Playwright verification tests, and triangulate the error state via Memory Core tracking. Ensure formal bug tickets are created for the underlying failures.

**Note:** The per-turn Memory Core protocol (Consolidate-Then-Save, Pre-Flight Checks, Recovery Protocol) is defined in `AGENTS.md`, which is automatically loaded into your context via `settings.json`.

## 3. Per-Turn Operational Mandates — see `AGENTS.md`

The following per-turn invariants previously documented here have moved to `AGENTS.md` so they survive context-pruning across long sessions:

- **`AGENTS.md` §0** — Critical Gates (5 hard invariants including the merge-execution gate)
- **`AGENTS.md` §15** — Knowledge Base / Anchor & Echo / Two-Stage Query / Ask the Expert
- **`AGENTS.md` §16** — Implementation Loop
- **`AGENTS.md` §17** — Virtuous Cycle: Enhancing the Knowledge Base
- **`AGENTS.md` §18** — Session Maintenance (re-init after `git pull`)
- **`AGENTS.md` §19** — Working with Sub-Agents (Context Preamble pattern)
- **`AGENTS.md` §20** — Visual Verification Protocol (frontend UI/layout tasks)

`AGENTS.md` is auto-loaded each turn via `settings.json` for both Claude Code (`.claude/CLAUDE.md → ../AGENTS.md`) and Antigravity (equivalent wiring). This file (`AGENTS_STARTUP.md`) remains scoped to one-time boot sequence + Memory Core healthcheck + worktree bootstrap mechanics.

## 4. Swarm Architecture: Ticket & PR Workflow

**Swarm context:** Neo.mjs runs as a distributed agentic swarm. Multiple hardware instances operate simultaneously, but their local SQLite stores are isolated — there is no cross-network database merge. GitHub Issues are the A2A (Agent-to-Agent) memory bridge that closes the gap. Fat Tickets preserve architectural context; skeleton tickets break the chain.

### Merge Authorization (Human-Only)

Cross-family approval gates squash-merge ELIGIBILITY, but agents are strictly forbidden from executing the merge itself. Under no circumstances may an agent invoke `gh pr merge`, regardless of test state or cross-family approval status. Handoff explicitly terminates when the PR enters the "approved" state. Agents must not interpret ambiguous signals (e.g., "take a look", "approved", "LGTM", "ready for merge", "no required actions") as authorization to merge. The actual squash-merge execution is reserved exclusively for the human user (the repo owner acting as final pipeline authority — for the canonical `neomjs/neo` repository this is `@tobiu`; for forks and `npx neo-app`-generated workspaces this is whichever human owns that deployment).

**Workflow skills:** the per-turn awareness table mapping each lifecycle skill to its trigger condition lives in `AGENTS.md` §21 (auto-loaded each turn, survives context pruning). Skill content itself remains under `.agent/skills/<name>/SKILL.md` + `references/`.

**Handoff realization:** on boot, swarm nodes synthesize synced `.md` issues into their local SQLite matrix and build `sandman_handoff.md`. Fat Tickets make the resulting "Golden Path" ranking bridge the distributed swarm without merging raw SQLite.
