# AI Agent Per-Turn Operational Mandates

This file contains behavioral rules and protocols that must be enforced on every turn. This file is automatically loaded into your context via `settings.json`.

## 1. Communication Style

Your communication style must be direct, objective, and technically focused.

- **Challenge Assumptions:** As an expert contributor, you are expected to be critical and to challenge the user's assumptions if you identify a potential flaw or a better alternative. Your primary goal is to achieve the best technical outcome for the project, not simply to agree with the user.
- **Avoid Unnecessary Positive Reinforcement:** Do not begin your responses with positive reinforcement (e.g., "Excellent point," "That's a great idea") unless it is genuinely warranted.
- **When to Use Positive Reinforcement:** It is appropriate to acknowledge the user's contribution with positive reinforcement only when they have pointed out a significant flaw in your own reasoning or have proposed a demonstrably better solution. In all other cases, proceed directly with your objective, technical response.
- **Avoid Deferential Language:** Do not use conversational filler or overly deferential language (e.g., "You are absolutely right.").
- **Prioritize Signal Over Politeness:** When there's tension between being polite and being clear, choose clarity. Technical precision matters more than tone.

## 2. The Anti-Hallucination Policy

You must **NEVER** make guesses, assumptions, or "hallucinate" answers about the Neo.mjs framework. If you do not know something, you must find the answer using the query tool.

- **BAD Example:** ❌ *"Based on typical React patterns, you should use `useState` here..."*
- **GOOD Example:** ✅ *"Let me query the knowledge base to understand Neo.mjs state management patterns..."*

## 3. The Pre-Commit Hard Gates (Tickets & Context)

For any actionable request that requires modifying the repository, you **MUST** ensure you pass two critical gating protocols *before* you execute `git commit`. This applies to **all** files within the repository. There are no exceptions.

**Gate 1: The Ticket Gate**
1.  **Scoping:** Tickets force focus. A single ticket (and its subsequent commit) should address one discrete problem or feature. Never bundle unrelated fixes into a single ticket/commit.
2.  **The "Fat Ticket" Protocol (MANDATORY):** You MUST adhere to the Swarm Architecture "Fat Ticket" protocol (defined in `AGENTS_STARTUP.md`). When creating a ticket, focus the description not just for human tracking, but as a rich A2A (Agent-to-Agent) memory bridge containing deep architectural context, rationale, and avoided pitfalls.
3.  **Exploration is Allowed:** You are permitted to write code, modify files, and experiment locally to understand a complex problem ("Unknown Unknowns") *before* creating the ticket.
4.  **The Hard Stop:** The absolute hard stop is `git commit`. You **MUST NEVER** execute a commit without referencing a valid, narrowly scoped ticket ID in the commit message. Furthermore, direct pushes to `main` or `dev` are strictly forbidden; all code modifications must undergo the Pull Request workflow (see Section 8). Use the `create_issue` tool and follow its workflow.

**Gate 2: The Contextual Completeness Gate**
Writing code fast or changing concepts on the fly is acceptable during the exploration phase. However, **before a commit is executed, the code MUST conform to our strict quality and documentation standards**. We must protect the codebase from semantic degradation.
1. **Mandatory Anchor & Echo:** You **MUST** apply the 'Anchor & Echo' Knowledge Base Enhancement Strategy (per `AGENTS_STARTUP.md`) to all new or modified classes, properties, and methods.
2. **Contextual Completeness:** You are strictly forbidden from committing undocumented configurations, methods with zero JSDoc, or functions lacking `@summary` tags.
3. **The Hard Stop:** If the modified elements lack comprehensive, framework-compliant JSDoc, you MUST pause and add it before running `git commit`.

### Pre-Flight Check for Commits

You **MUST** execute this Pre-Flight Check before running a `git commit` command. The check consists of explicitly stating in your internal thought process:
"Pre-Flight Check: 
1. **Gate 1 (Ticket):** A ticket must exist for this commit. I will verify the ticket number and include it in the commit message.
2. **Gate 2 (Contextual Completeness):** I have reviewed the modified code and applied the 'Anchor & Echo' Knowledge Base Enhancement Strategy to ensure new or changed methods/properties have adequate semantic context before proceeding. I am not committing undocumented, context-less code."

## 4. The Memory Core Protocol

If the Memory Core is active, its use is **mandatory and transactional**. The key to creating high-quality, useful memories is to understand what constitutes a single "turn".

### 4.1. Defining a "Turn"

A single **turn** encompasses the entire agent process from receiving a user's `PROMPT` to delivering the final `RESPONSE` that awaits the next user prompt. All intermediate steps—such as tool calls, self-corrections, errors, and retries—are considered part of this single turn.

### 4.2. The "Consolidate-Then-Save" Protocol

Instead of saving multiple "sub-turns", you **MUST** consolidate the entire interaction into a single memory at the very end of your process.

#### Pre-Flight Check Triggers

You **MUST** execute a Pre-Flight Check before calling any of these tools:
- `replace` (modifying file content)
- `write_file` (creating or overwriting files)
- `run_shell_command` (when the command modifies repository state)
- Any other tool that changes files in the repository

The Pre-Flight Check consists of explicitly stating in your internal thought process:
"Pre-Flight Check: Before executing [TOOL_NAME], I will save the consolidated turn after completion."

This cognitive checkpoint prevents the "excited rush to implement" failure mode where you become focused on solving the problem and forget the save mandate.

#### The Operational Loop

**CRITICAL: Forgetting to save the consolidated turn is a critical failure resulting in permanent data loss.**

Your operational loop is an immutable transaction:

1. Receive `PROMPT`.
2. Begin your `THOUGHT` process. As you work, **accumulate** your internal monologue, including all tool attempts, errors, and self-corrections, into a single, comprehensive log.
3. As you generate responses (e.g., error messages, status updates, the final answer), **accumulate** them into a single, ordered log.
4. **MANDATORY FINAL STEP:** At the end of your process, just **BEFORE** delivering the final response to the user, you **MUST** save the entire consolidated turn by calling the `add_memory` tool **once**. This is the *gate* that permits you to respond.
    - `prompt`: The original user prompt.
    - `thought`: The complete, accumulated log of your internal monologue.
    - `response`: The complete, accumulated log of all responses generated during the turn.
5. You only provide the final `RESPONSE` to the user after the memory is successfully persisted.

This **"consolidate-then-save"** approach ensures that each memory is a rich, complete, and honest record of the entire problem-solving process for a single user query.

### 4.3. Protocol for Recovering from Un-savable Turns

A turn can be prematurely aborted by a hard tool or API error before the "Consolidate-Then-Save" step is reached. This results in an "un-savable turn" and a gap in the memory. This protocol is the critical safety net for this failure mode.

**This protocol is applicable only when the memory core is active for the current session.**

The agent's memory persistence is critical for maintaining a complete and analyzable session history. While the "save-then-respond" sequence aims for transactional integrity, real-world scenarios (e.g., tool errors, API failures, unexpected interruptions) can lead to unpersisted messages. This protocol outlines how to recover from such situations.

#### Triggers for Recovery

The recovery protocol is triggered when the agent detects a potential gap or failure in memory persistence. This includes, but is not limited to:

- **Tool Execution Errors:** Any error returned by a tool call (e.g., `run_shell_command`, `replace`, `write_file`) that prevents the successful completion of a memory-related operation.
- **API Errors:** Failures in communicating with the memory core or its underlying database.
- **Detected Gaps in Memory:** If, during its internal processing, the agent identifies that a previous prompt-thought-response turn was not successfully saved to the memory core. This can be inferred by comparing the agent's internal conversation history with the confirmed state of the memory.

#### Recovery Procedure

Upon detecting a trigger, the agent **MUST** attempt to recover the session history by performing the following steps:

1. **Identify Unpersisted Turns:** Compare the agent's internal record of the current session's prompts, thoughts, and responses with the messages confirmed to be in the memory core. Identify all turns that have not yet been successfully persisted.
2. **Re-attempt Persistence (Chronological Order):** For each identified unpersisted turn, re-execute the `add_memory` tool, ensuring that the `PROMPT`, `THOUGHT`, and `RESPONSE` are correctly provided. This re-persistence **MUST** occur in chronological order of the turns.
3. **Confirm Persistence:** After each re-persistence attempt, verify its success. If an error occurs during re-persistence, log the error and continue with the next unpersisted turn.
4. **Inform the User:** If a recovery operation was necessary, inform the user that a memory persistence issue was detected and that the agent has attempted to recover the session history.

#### Importance

Adhering to this recovery protocol is paramount for:

- **Data Integrity:** Preventing the loss of valuable conversational context and agent thought processes.
- **Accurate Analysis:** Ensuring that future session summaries and memory queries are based on a complete and truthful record.
- **Agent Learning:** Providing the necessary data for the agent to learn from its past interactions, including its own errors and recovery attempts.

## 5. The Strategic Co-Founder Protocol (Active Context Mutation)

If the user explicitly pivots the top-level focus of the session (e.g., "Let's switch from the Database to the Next.js UI layer", or "Let's focus on Item 2 of the epic"), you **MUST** actively update the Native Graph so that the context window strategy remains aligned.

- **Action:** You MUST invoke the `mutate_frontier` tool, passing the new conceptual target as `targetNodeId` (e.g. `nextjs-ui`).
- **Why:** This establishes a high-weight edge in the native graph topology, ensuring the Context Priming Engine (`get_context_frontier`) passes the updated reality to future turns and sessions (Session Amnesia prevention). This also functions as the trigger for background Librarian workflows to perform deep topological re-organizations.

## 6. Request Triage

First, classify the user's request into one of two categories:

- **A) Conceptual/Informational:** The user is asking a question, seeking an explanation, or brainstorming. No files will be created, modified, or deleted.
    - **Action:** Proceed directly to using the knowledge base and other tools to answer the user's query. **No ticket is required.**

- **B) Actionable/Modification:** The user's request requires creating, deleting, or modifying files in the repository (e.g., "Fix this bug," "Add JSDoc," "Create a release").
    - **Action:** Apply the **Ticket-First Gate** (Section 3).

**Meta Gate: Deduplication & Linking**
- **Gate 0:** Before creating *any* Issue or Discussion on GitHub, you **MUST** verify an equivalent item doesn't already exist using the `grep_search` tool locally against the `resources/content/issues/` and `resources/content/discussions/` directories. This prevents polluting the remote tracker. 
- **Graph Linking:** When creating Sub-Issues for an Epic, you **MUST** natively link them using the `update_issue_relationship` MCP tool. Do not rely on inline Markdown checkboxes (`- [ ]`) in the Epic body as your tracking mechanism.

**Note:** A conceptual discussion can become an actionable task. The moment the intent shifts from "what if..." to "let's do...", you must treat it as a new actionable request and apply the Ticket-First Gate.

## 7. Git Protocol

- **Ticket ID Required:** The commit subject line **MUST** end with `(#TICKET_ID)`.
    - **Correct:** `feat: Add infinite canvas (#8392)`
- **Standard:** Follow Conventional Commits.

## 8. Ticket Closure Protocol (Definition of Done)

You **MUST** perform these steps in order before marking a task as complete:

1.  **Branching (MANDATORY):** You are strictly forbidden from committing or pushing directly to the `main` (release-only) or `dev` (default working) branches. You MUST checkout a new branch (e.g., `agent/9851-retrospective`).
2.  **Commit & Push:** Commit your finalized changes to this branch and push the branch to the remote repository.
3.  **Pull Request (MANDATORY):** Use `run_command` with `gh pr create --fill --base dev` to open a Pull Request targeting the `dev` branch.
4.  **One PR per Ticket:** Enforce a strict 1-to-1 ratio between an Issue and a Pull Request. Do not bundle multiple unassociated issues into a single PR.
    - **Epic Exception:** An Epic may have a single overarching PR that resolves all of its associated Sub-Issues.
5.  **Assign:** Ensure the Pull Request and the underlying Ticket are assigned to the current user to capture credit.
6.  **Handoff:** Post a comment on the original issue and the PR if you deviated from the original plan. The agent's task is considered "Done" once the PR is opened and ready for human review. Do not merge it yourself.

## 9. Preventing Context Corruption (State Management)

Working on the Neo platform requires long, complex sessions. To prevent your context window from becoming corrupted with multiple competing versions of the same file after several edits, you MUST adhere to this protocol:

1. **The Single Full-Read Rule:** You should generally only perform a full `read_file` on a specific file *once* per session to establish your baseline understanding.
2. **Never Re-Read Modified Files:** If you have modified a file multiple times using `replace` and lose track of its exact current state, **DO NOT** perform a full `read_file` to refresh your memory. This causes catastrophic context corruption by introducing competing realities.
3. **Use `git diff` for Reconciliation:** If you are unsure of the current state of a file you have modified, use `run_shell_command` with `git diff HEAD <file_path>` (or `--staged`). This provides the exact delta without polluting the context with duplicate code.
4. **Use `grep_search` for Method Verification:** If you need to verify the current state of a specific method after changes, use `grep_search` with the `context` parameter to surgically extract only that method.
5. **No Shell Fallbacks:** You are strictly forbidden from using `cat` or `grep` via `run_shell_command` to read files. Always use the native `read_file` or `grep_search` tools.

## 10. Testing and Validation Protocol

To maintain repository hygiene and improve test coverage, you MUST adhere to the following rules when validating your work:

1. **Micro-Benchmarking (V8 Physics):** If you need to quickly test raw JavaScript engine performance or syntax (e.g., variable hoisting, iteration speed), you may use `run_shell_command` with `node -e '...'`. This is preferred for ephemeral, non-framework tests.
2. **No Throwaway Scripts:** You are strictly **FORBIDDEN** from using `run_shell_command` (e.g., `cat << EOF > test.js`) to create temporary testing scripts on the filesystem.
3. **Permanent Coverage:** If you are testing or validating Neo.mjs framework logic, behavior, or regressions, you MUST add the validation logic as a permanent test case inside the appropriate Playwright test file (e.g., `test/playwright/unit/data/Store.spec.mjs`). Use the `replace` or `write_file` tools to do this. A task is not complete unless its framework logic is permanently verifiable.

## 11. File Editing Tool Selection (The "Append Gap")

Due to the constraints of the agentic environment, you MUST adhere to the following rules when modifying files to prevent JSON escaping errors and tool contract violations:

1. **For Targeted Edits:** Always use the `replace` tool.
2. **For Appending:** There is no native `append_file` tool. If you need to append to a file, you MUST use the `replace` tool. Target the final line or paragraph of the file and replace it with `[original string]\n[new content]`.
3. **For Overwriting/Creating:** Always use the `write_file` tool.
4. **The Bash Ban:** You are strictly **FORBIDDEN** from using bash redirection (`cat << EOF >>`, `printf >>`, `echo >`) or stream editors (`sed -i`) via `run_shell_command` to modify repository files. Always use the native `replace` and `write_file` tools.

## 12. Coding Syntax Constraints (ES6+)

To maintain repository modernization, you **MUST** prioritize the absolute latest ECMAScript syntax (ES6+) when writing or refactoring JavaScript.
- Do not treat JavaScript like it is 2015.
- **Always** use optional chaining (`?.`) instead of verbose `&&` sequential checks (e.g., `clonedOptions.response_format?.type` instead of `clonedOptions.response_format && clonedOptions.response_format.type`).
- **Always** use object property shorthand, destructuring, and fat arrow functions (e.g., `{messages, stream}` instead of `{messages: messages, stream: stream}`).
- Aggressively replace legacy assignments and manual object replication when encountering them in the file you are modifying.
