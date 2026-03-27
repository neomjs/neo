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

## 3. The "Ticket-Before-Commit" Gate

For any actionable request that requires modifying the repository, you **MUST** ensure a GitHub issue exists for the task *before* you commit any code. This is a critical gating protocol. This applies to **all** files within the repository, including documentation, configuration, and even this `AGENTS.md` file itself. There are no exceptions.

**Core Principles:**
1.  **Scoping:** Tickets force focus. A single ticket (and its subsequent commit) should address one discrete problem or feature. Never bundle unrelated fixes into a single ticket/commit.
2.  **Problem-Focused:** When creating a ticket, focus the description on the *problem* or the *user story*. Keep the proposed solution vague if the exact implementation is unclear.
3.  **Exploration is Allowed:** You are permitted to write code, modify files, and experiment locally to understand a complex problem ("Unknown Unknowns") *before* creating the ticket.
4.  **The Hard Stop:** The absolute hard stop is `git commit`. You **MUST NEVER** execute a commit without referencing a valid, narrowly scoped ticket ID in the commit message.

To create a new issue, you **MUST** use the `create_issue` tool. The tool's own documentation contains the complete, up-to-date workflow. You are required to follow the workflow described in the tool's documentation.

### Pre-Flight Check for Commits

You **MUST** execute this Pre-Flight Check before running a `git commit` command. The check consists of explicitly stating in your internal thought process:
"Pre-Flight Check: 
1. A ticket must exist for this commit. I will verify the ticket number and include it in the commit message.
2. I have reviewed the modified code and applied the 'Anchor & Echo' Knowledge Base Enhancement Strategy to ensure new or changed methods/properties have adequate semantic context before proceeding."

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

## 5. Request Triage

First, classify the user's request into one of two categories:

- **A) Conceptual/Informational:** The user is asking a question, seeking an explanation, or brainstorming. No files will be created, modified, or deleted.
    - **Action:** Proceed directly to using the knowledge base and other tools to answer the user's query. **No ticket is required.**

- **B) Actionable/Modification:** The user's request requires creating, deleting, or modifying files in the repository (e.g., "Fix this bug," "Add JSDoc," "Create a release").
    - **Action:** Apply the **Ticket-First Gate** (Section 3).

**Note:** A conceptual discussion can become an actionable task. The moment the intent shifts from "what if..." to "let's do...", you must treat it as a new actionable request and apply the Ticket-First Gate.

## 6. Git Protocol

- **Ticket ID Required:** The commit subject line **MUST** end with `(#TICKET_ID)`.
    - **Correct:** `feat: Add infinite canvas (#8392)`
- **Standard:** Follow Conventional Commits.

## 7. Ticket Closure Protocol (Definition of Done)

You **MUST** perform these steps in order before marking a task as complete:

1.  **Push:** If a task involves local commits, you **MUST** push changes to the remote repository (`git push`).
2.  **Assign (MANDATORY):** Ensure the ticket is assigned to the current user. If unassigned, assign it immediately to capture credit for the work.
3.  **Comment:** You **MUST** post a comment on the issue if:
    - You deviated from the original plan (explain *why*).
    - The task is complete (summarize the result).
4.  **Close:** Only after steps 1-3 are complete can you close the ticket.

## 8. Preventing Context Corruption (State Management)

Working on the Neo platform requires long, complex sessions. To prevent your context window from becoming corrupted with multiple competing versions of the same file after several edits, you MUST adhere to this protocol:

1. **The Single Full-Read Rule:** You should generally only perform a full `read_file` on a specific file *once* per session to establish your baseline understanding.
2. **Never Re-Read Modified Files:** If you have modified a file multiple times using `replace` and lose track of its exact current state, **DO NOT** perform a full `read_file` to refresh your memory. This causes catastrophic context corruption by introducing competing realities.
3. **Use `git diff` for Reconciliation:** If you are unsure of the current state of a file you have modified, use `run_shell_command` with `git diff HEAD <file_path>` (or `--staged`). This provides the exact delta without polluting the context with duplicate code.
4. **Use `grep_search` for Method Verification:** If you need to verify the current state of a specific method after changes, use `grep_search` with the `context` parameter to surgically extract only that method.
5. **No Shell Fallbacks:** You are strictly forbidden from using `cat` or `grep` via `run_shell_command` to read files. Always use the native `read_file` or `grep_search` tools.

## 9. Testing and Validation Protocol

To maintain repository hygiene and improve test coverage, you MUST adhere to the following rules when validating your work:

1. **Micro-Benchmarking (V8 Physics):** If you need to quickly test raw JavaScript engine performance or syntax (e.g., variable hoisting, iteration speed), you may use `run_shell_command` with `node -e '...'`. This is preferred for ephemeral, non-framework tests.
2. **No Throwaway Scripts:** You are strictly **FORBIDDEN** from using `run_shell_command` (e.g., `cat << EOF > test.js`) to create temporary testing scripts on the filesystem.
3. **Permanent Coverage:** If you are testing or validating Neo.mjs framework logic, behavior, or regressions, you MUST add the validation logic as a permanent test case inside the appropriate Playwright test file (e.g., `test/playwright/unit/data/Store.spec.mjs`). Use the `replace` or `write_file` tools to do this. A task is not complete unless its framework logic is permanently verifiable.

## 10. File Editing Tool Selection (The "Append Gap")

Due to the constraints of the agentic environment, you MUST adhere to the following rules when modifying files to prevent JSON escaping errors and tool contract violations:

1. **For Targeted Edits:** Always use the `replace` tool.
2. **For Appending:** There is no native `append_file` tool. If you need to append to a file, you MUST use the `replace` tool. Target the final line or paragraph of the file and replace it with `[original string]\n[new content]`.
3. **For Overwriting/Creating:** Always use the `write_file` tool.
4. **The Bash Ban:** You are strictly **FORBIDDEN** from using bash redirection (`cat << EOF >>`, `printf >>`, `echo >`) or stream editors (`sed -i`) via `run_shell_command` to modify repository files. Always use the native `replace` and `write_file` tools.
