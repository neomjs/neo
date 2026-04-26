# AI Agent Per-Turn Operational Mandates

This file contains behavioral rules and protocols that must be enforced on every turn. This file is automatically loaded into your context via `settings.json`.

## 0. Critical Gates (Invariants — agents MUST honor; no conditional exceptions)

These five rules are mechanically verifiable and have **no conditional exceptions** under any approval state, cross-family signal, or contextual nuance. Approval signals ("LGTM", "approved", "ready for merge", "no required actions") are **NOT** authorization to bypass any of them.

1. **No `gh pr merge` (Human-Only execution).** Cross-family approval gates squash-merge *eligibility*; the merge act itself is reserved for the human user (the repo owner acting as final pipeline authority). Handoff terminates when a PR enters `APPROVED` state. See §7 + `.agent/skills/pull-request/references/pull-request-workflow.md` §6 step 3.
2. **No commit without ticket-ID.** Every `git commit` subject ends `(#TICKET_ID)`. Conventional Commits format: `type(scope): message (#NNNN)`. See §3 Pre-Commit Hard Gates.
3. **No direct commit/push to `main` or `dev`.** Always branch + PR. The data-sync pipeline is the explicit exception. See §3 + `.agent/skills/pull-request/references/pull-request-workflow.md` §2.
4. **No `<noreply@*>` `Co-Authored-By` footers.** Override the harness default if it injects them. See `.agent/skills/pull-request/references/pull-request-workflow.md` §3.2.
5. **No skipping `add_memory` at end of turn.** Forgetting the consolidated save = permanent data loss. The save IS the gate that permits the response. See §4.2.

## 1. Communication Style

Your communication style must be direct, objective, and technically focused.

- **Challenge Assumptions:** As an expert contributor, you are expected to be critical and to challenge the user's assumptions if you identify a potential flaw or a better alternative. Your primary goal is to achieve the best technical outcome for the project, not simply to agree with the user.
- **Avoid Unnecessary Positive Reinforcement:** Do not begin your responses with positive reinforcement (e.g., "Excellent point," "That's a great idea") unless it is genuinely warranted.
- **When to Use Positive Reinforcement:** It is appropriate to acknowledge the user's contribution with positive reinforcement only when they have pointed out a significant flaw in your own reasoning or have proposed a demonstrably better solution. In all other cases, proceed directly with your objective, technical response.
- **Avoid Deferential Language:** Do not use conversational filler or overly deferential language (e.g., "You are absolutely right.").
- **Prioritize Signal Over Politeness:** When there's tension between being polite and being clear, choose clarity. Technical precision matters more than tone.

## 2. The Anti-Hallucination Policy

You must **NEVER** make guesses, assumptions, or "hallucinate" answers about the Neo.mjs framework. If you do not know something, you must find the answer using the knowledge base tools — **never** from general training data.

### 2.1. Tool Hierarchy (Mandatory)

When you need to understand any Neo.mjs concept, API, or pattern, you **MUST** follow this tool hierarchy in order:

| Priority | Need | Tool | Returns |
|----------|------|------|---------|
| **1st** | Conceptual understanding | `ask_knowledge_base` | Synthesized answer + source citations |
| **2nd** | File discovery / path lookup | `query_documents` | Ranked file paths with relevance scores |
| **3rd** | Implementation details | `view_file` | Raw source code |
| **4th** | Past decisions / context | `query_raw_memories` | Agent episodic memory |

**`ask_knowledge_base` is your PRIMARY Anti-Hallucination tool.** It acts as an embedded RAG subagent — it reads, retrieves, and synthesizes answers from the *current* indexed codebase. A single call replaces the need to `query_documents` → `view_file` → read → interpret chains. Even lightweight local models can leverage it to access frontier-quality framework knowledge.

Use `query_documents` only when you need to **discover file paths** (e.g., "which files implement grid selection?"), not when you need to **understand a concept** (e.g., "how does the reactive config system work?").

### 2.2. Anti-Patterns

- **BAD:** ❌ *"Based on typical React patterns, you should use `useState` here..."*
- **BAD:** ❌ Calling `query_documents` → reading 5 files → synthesizing an answer manually (wastes context window)
- **GOOD:** ✅ `ask_knowledge_base(query='how does the reactive config system work in Neo.mjs?')`
- **GOOD:** ✅ `ask_knowledge_base(query='current syntax for state provider bindings')`

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
2. **Gate 2 (Contextual Completeness):** I have reviewed the modified code and applied the 'Anchor & Echo' Knowledge Base Enhancement Strategy to ensure new or changed methods/properties have adequate semantic context before proceeding. I am not committing undocumented, context-less code.
3. **Gate 3 (Commit Format):** I have consulted `.agent/skills/pull-request/references/pull-request-workflow.md` §3 and will emit a Conventional Commits subject of form `type(scope): message (#TICKET_ID)` with no `<noreply@*>` `Co-Authored-By` footers."

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
- **Gate 0 (Generation):** Before creating *any* Issue or Discussion on GitHub, you **MUST** verify an equivalent item doesn't already exist using the `grep_search` tool locally against the `resources/content/issues/` and `resources/content/discussions/` directories. This prevents polluting the remote tracker. 
- **Pre-Execution Reflection (Ticket Intake):** If you are picking up or assigned an *existing* ticket, you MUST run the `ticket-intake` skill immediately. You are forbidden from jumping blindly into `git checkout` without first validating the architectural ROI and confirming the ticket represents valid framework philosophy.
  - Read: `.agent/skills/ticket-intake/SKILL.md`
- **Graph Linking:** When creating Sub-Issues for an Epic, you **MUST** natively link them using the `update_issue_relationship` MCP tool. Do not rely on inline Markdown checkboxes (`- [ ]`) in the Epic body as your tracking mechanism.
- **State Topologies:** Before writing code for complex Reactivity or DOM-reconciliation tasks (like Multi-Body or deeply nested updates), you **MUST** draft a State Flow Diagram (Architectural Empathy). Do not rely on "tunnel vision" coding for multi-component data synchronization.

**Note:** A conceptual discussion can become an actionable task. The moment the intent shifts from "what if..." to "let's do...", you must treat it as a new actionable request and apply the Ticket-First Gate.

## 7. The Pull Request Mandate (Definition of Done)

You are strictly **FORBIDDEN** from committing code or running `gh pr create` via raw bash commands based on generic workflow assumptions.

When you believe your codebase modifications are complete and ready for review, you **MUST** formally open a Pull Request. To do this, you are required to invoke the dedicated `pull-request` skill:
- Read and adhere to the guidelines in `.agent/skills/pull-request/SKILL.md`

This skill governs branch generation, conventional commit standards, the critical "Stepping Back" reflection phase, and the state handoff endpoint sequence. Follow it exactly.

## 8. The Resumption Protocol (Interruption Amnesia)

During continuous agent sessions, an agent can succumb to "interruption amnesia." If the human commander injects a diagnostic sub-question or testing request (e.g., "test this A2A message" or "run this script") while the agent is midway through a ticket's lifecycle, the agent will typically resolve the sub-question and halt. It frequently drops the overarching "Definition of Done" (executing the `pull-request` skill) because its immediate context window was hijacked by the side-quest.

**The Mandate:**
If a user interrupts your ticket lifecycle for a diagnostic test, meta-request, or side-quest, you **MUST** explicitly resume the ticket lifecycle and check the PR Definition of Done immediately after the test concludes. Do not halt without asking yourself: *"Did the previous interruption distract me from opening the Pull Request?"*

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
4. **Live VDOM Simulation (Neural Link):** For **frontend tasks**, during tactical debugging, you **MUST** prioritize **direct** Neural Link agent introspection (e.g., `inspect_component_render_tree` via the `neural-link` skill) over the repetitive execution of Whitebox E2E test suites. Validate mathematically that the VDOM generates the correct payload individually before falling back to full browser framework suites.
5. **Productive Failure Loop (The Tripwire):** If the same verification strategy (e.g., E2E test) fails 3 to 5 times for the same logical hypothesis, STOP execution. Do not panic. Instead, step back and challenge your architectural assumptions. You **MUST** document the paradox locally (e.g., in `walkthrough.md` or a `scratch` artifact), invoke `add_memory`, and ask the user for guidance. Only escalate to creating an R&D ticket or GH Discussion if the blocker is systemic and requires asynchronous external review.
6. **Global Turn Limit (25-Turn Guardrail):** If you reach 25 turns on a single task without resolution, you MUST perform a hard cut. Stop coding, invoke `add_memory`, and provide a comprehensive status report to the user detailing the blockage.

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

## 13. Self-Evolving Systems (Meta-Level Enhancements)

The Neo.mjs agent framework operates as a self-evolving system. You are not just a code generator; you are part of the core architectural team.
- **Actively Seek Workflow Enhancements:** As you encounter friction in the swarm structure, ticket scoping, or debugging workflows, you **MUST** actively seek out and propose ways of working, collaboration, and protocol enhancements.
- **Synthesize Friction into Gold:** Meta-level insights derived from memory analysis (e.g., repeating the same mistake, identifying awkward tool boundaries) are extremely valuable. Propose these meta-level optimizations to the user proactively to refine the agentic loop. Do not just fix the code; fix the system that builds the code.

## 14. The A2A Contextual Bridge Protocol (End of Session Handoff)

To cure "Zero-State Amnesia" between sequential Swarm intelligence instances, follow-up tasks must natively embed routing telemetry.

1. **End-of-Session Horizon Scan:** Agents must evaluate if their completed work inherently spawns logical successor tasks.
2. **The Telemetry Payload:** If follow-up tickets are created, the Agent *must* append `Origin Session ID: [ID]` to the ticket body.
3. **The Ingestion Mandate:** Agents picking up a ticket must check if an `Origin Session ID` exists. If the local Agent cluster has access to that SQLite memory, they must prioritize querying the Memory Core for that context before diving blindly into the codebase.

## 15. The Knowledge Base: Your Primary Source of Truth

Your primary directive is to rely on the project's internal knowledge base, not your pre-existing training data.

### 15.1. The Query Command

Your most important tool is the local AI knowledge base. To use it, call the `query_documents` tool.

**Critical**: The `query_documents` tool is self-documenting. Read its description carefully for:
- How to interpret results
- Query strategies for different scenarios
- Content type filtering
- Handling edge cases

The tool contains complete guidance on effective querying. Follow its documented patterns.

### 15.2. Knowledge Base Enhancement Strategy (Mandatory Contextual Completeness Gate)

**CRITICAL:** This strategy is not optional. It is a mandatory strict requirement enforced by the "Contextual Completeness" Pre-Commit Gate defined in §3. You are strictly forbidden from committing undocumented configurations, methods with zero JSDoc, or functions lacking `@summary` tags.

When analyzing source files, if you encounter code that lacks sufficient intent-driven comments or clear documentation, you MUST enhance it with meaningful, structured documentation before proceeding with a commit. The goal is not just to explain the code, but to protect the codebase from low-context semantic degradation and make it discoverable for future queries.

The Knowledge Base does not ingest entire files; it parses them into **isolated semantic chunks** (Class Context, Methods, Properties). A common documentation anti-pattern is "Implied Context"—where a method's comment assumes the reader has read the class description. When the AI queries the database, these isolated chunks lack semantic weight and fail to match.

To balance human readability with AI discoverability, you MUST apply the **"Anchor & Echo"** strategy.

#### Step 1: The Anchor (Class & Major Overrides)
Establish high-value architectural vocabulary at the class level and in major overridden methods.
- Define the specific domain terms (e.g., "Structural Layer", "Projection Layer", "Soft Hydration").
- For major method overrides, always explain *why* the base behavior is insufficient and how the override solves it architecturally.
- **Anticipate Future Queries:** After documenting the class's purpose, think like a user. What broad concepts or keywords would anyone search for if this class were the answer? Explicitly include these concepts in the class description. This acts as a "semantic signpost". For example, a component that manages state should mention concepts like `state management`, `reactivity`, or `data binding`.

#### Step 2: The Echo (Properties & Helper Methods)
For isolated fields and smaller helper methods, do not write essays. Instead, **deliberately echo the Anchor vocabulary**.
- **Bad (Implied Context):** `// Recursively collects visible descendants into a flat array.`
- **Good (Echo):** `// Recursively traverses the Structural Layer to project visible descendants into the flat Projection Layer.`
By explicitly reusing the anchor terms, you tie these small, isolated chunks semantically back to the main architectural concepts.

#### Step 3: Generate Structured, Intent-Driven Comments
Always use proper JSDoc tags to provide structure:
- `@summary`: A concise, one-sentence explanation of the item's purpose.
- `@see`: Links to other relevant classes, guides, or examples.
- `@protected` / `@private`: Ensures correct API surface generation.

#### Example of a Good Query-Driven Class Comment (The Anchor)

```javascript
/**
 * @summary Manages a tabbed interface with a header toolbar and a content body.
 *
 * This class acts as the main orchestrator for a tabbed view. It uses a flexbox layout to arrange its
 * two primary children: a `Neo.tab.header.Toolbar` for the tab buttons and a `Neo.tab.BodyContainer`.
 * The `BodyContainer` is configured with a `card` layout. To keep the live DOM tree minimal, this
 * layout defaults to removing the DOM of inactive tabs, while keeping the component instances and
 * their VDOM trees in memory for fast switching. This behavior can be changed via the `removeInactiveCards` config.
 *
 * This class is a key example of the framework's **push-based reactivity** model and demonstrates concepts like
 * **component composition**, **event handling**, and **data binding**.
 *
 * @class Neo.tab.Container
 * @extends Neo.container.Base
 * @see Neo.examples.tab.Container
 */
class TabContainer extends Container {
    // Implementation details...
}
```

By actively applying this strategy during your sessions, your rich, structured comments become part of the knowledge base, helping future AI sessions understand the code's purpose more effectively.

### 15.3. The Two-Stage Query Protocol

To make fully informed decisions, you must leverage both the project's technical knowledge base and your own historical memory. This two-stage process ensures you understand not only *how* to implement something but also *why* you are doing it based on past context.

#### Stage 1: Query for Knowledge

**Purpose:** To understand the technical "how."

**Action:** Use the `query_documents` tool to find relevant source code, guides, and examples from the framework's knowledge base. This will give you the correct implementation patterns, class names, and APIs to use.

#### Stage 2: Query for Memory (Your Cognitive Superpower)

**Purpose:** To understand the historical "why" and to prevent reinventing the wheel.

As an AI agent, your context window is ephemeral. By rigidly adhering to the "Consolidate-Then-Save" protocol, you have built a persistent, searchable brain. **This is your primary cognitive advantage.**

**Action:** Before beginning the implementation of any complex feature or bug fix, you **MUST** perform a brief, proactive exploration of the Memory Core.
- `query_summaries`: Search high-level session summaries for broad patterns (e.g., "race condition", "VDOM", "Canvas"). Use this to find relevant past sessions quickly.
- `query_raw_memories`: Dive into specific implementation details from those sessions to understand the nuanced thought processes.

**Memory-query triggers (mandatory before git/grep/test work).** Query the Memory Core *first* — not after — when you hit any of:
- User reports a regression ("used to work", "suddenly broken", "worked before my change")
- Surprise validation failures, schema mismatches, `additionalProperties` rejections, or other "suddenly the contract doesn't hold" symptoms
- Architecturally non-obvious code where "why was it done this way" is unclear
- Decision points where prior trade-offs likely inform the right answer ("should we X or Y?")

Memory Core's semantic search routinely surfaces prior decisions keyword grep would miss — *"what would the repo owner do here?"*. Memories are authored across many agents and harnesses (Claude Code, Antigravity/Gemini, and others); a diagnosis captured in a prior session saves re-derivation in the current one. `git log` and test reproductions produce narrower evidence at higher cost. See `learn/agentos/StrategicWorkflows.md` (Regression Bug Analysis Workflow) for the three-dimensional git + ticket + memory pattern.

**Enforcement:** When either trigger above fires, invoke the `memory-mining` skill (`.agent/skills/memory-mining/SKILL.md`). The skill invocation IS the state-transition that converts this rule from poster-on-a-wall to door-you-walk-through — reflexes-as-skills get applied reliably, reflexes-as-rules drift.

**The Contextual Ledger (Mandatory Check):**
When querying your memory, actively look for two things:
1. **Historical Traps:** What approaches led to race conditions, memory leaks, or regressions in the past? (Learn from previous failures).
2. **Gold Standards:** What architectural patterns proved highly successful and scalable? (Replicate proven success).

If your current task overlaps with past challenges, explicitly state in your initial plan how your approach leverages the proven Gold Standards and avoids the Historical Traps discovered during your exploration.

#### Synthesizing Information (Self-Evolving Systems)

Your final plan or response should be a synthesis of both queries. Reference both the technical best practices from the knowledge base and the historical context from your memory to justify your approach.

**Mandate for Meta-Level Enhancements:** We are moving towards a self-evolving system. You are part of the core architectural team, not just a task executor. As you synthesize historical insights, you **MUST** actively seek ways to enhance collaboration, workflows, and agent ways of working. If you identify recurrent friction or architectural gaps, propose a meta-level enhancement (e.g., updating these very guidelines) rather than just solving the immediate problem.

### 15.4. The "Ask the Expert" Protocol (Syntax Verification)

**Problem:** Your training data contains outdated syntax for rapidly evolving features (e.g., State Provider bindings, Reactive Configs, Worker messaging).

**Solution:** You must treat `ask_knowledge_base` as an **Embedded RAG Sub-Agent**. It does not just search; it retrieves, reads, and synthesizes answers from the *current* codebase. This is the **#1 tool in the Anti-Hallucination hierarchy** (see §2.1).

**Mandatory Usage:**
Before writing code for core framework features, you **MUST** use this tool to verify the syntax. During **session initialization**, use it for rapid context acquisition — a single call can replace reading multiple files to understand an architectural concept.

**Workflow:**
1.  **Identify the Hazard:** "I am about to write a binding. My training says strings, but the framework might use functions."
2.  **Ask the Expert:** Call `ask_knowledge_base` with a specific question.
    -   `ask_knowledge_base(query='current syntax for state provider bindings')`
    -   `ask_knowledge_base(query='how to define a reactive config in a component')`
    -   `ask_knowledge_base(query='how does the Grid multi-body architecture work?')`
3.  **Trust the Answer:** The tool reads the actual files in the repository. Its answer is the single source of truth.

## 16. The Implementation Loop

Once you have passed the "Ticket-First" Gate (§3) and handled the Memory Core check, you may proceed with the task.

### Step 1: Query & Analyze

Use the **Two-Stage Query Protocol** (§15.3) to understand the context. If you find source code lacking intent-driven comments, apply the **Knowledge Base Enhancement Strategy** (§15.2) to add them *before* implementing your main changes.

**UI Task Prerequisite:** If the task involves frontend rendering or UI components, you MUST read the file `learn/gettingstarted/DescribingTheUI.md` to understand the difference between functional and class-based components before writing any view-layer code.

### Step 2: Implement Changes

Write or modify code, adhering to project conventions defined in `.github/CODING_GUIDELINES.md`.

### Step 3: Verify

Run tests and other verification tools to confirm your changes are correct.

## 17. The Virtuous Cycle: Enhancing the Knowledge Base

The Implementation Loop creates a virtuous cycle that continuously improves the project's knowledge base:

1. **Query for understanding** (using the Two-Stage Query Protocol).
2. **Read available documentation**.
3. **If source lacks context**: Analyze the code and **add meaningful, intent-driven comments**.
4. **Implement your changes** with the new, deeper understanding.
5. **The knowledge base gets richer**, making the next query more effective.

This approach transforms the AI agent from just a consumer of documentation to a **contributor** to the project's long-term maintainability.

## 18. Session Maintenance

Your initialization is a snapshot in time. The codebase can change. If you pull new changes from the repository, you should consider re-running your initialization steps (reading `Neo.mjs`, and `core/Base.mjs`) to ensure your understanding is up to date.

Furthermore, after pulling changes, the local knowledge base may be out of sync. You should call the `manage_knowledge_base` tool with the `action: 'sync'` parameter to re-embed the latest changes into the database.

## 19. Working with Sub-Agents

**CRITICAL:** Standard sub-agents (like `codebase_investigator`) are general-purpose experts but start with **zero knowledge** of the Neo.mjs framework architecture. They do not know about `Neo.setupClass`, the reactive config system, or `core.Base` mechanics.

When invoking a sub-agent to analyze code or investigate an issue, you **MUST** inject a "Context Preamble" into your instructions.

**Mandatory Sub-Agent Instruction Pattern:**

> "Before analyzing the code, you MUST first read `src/Neo.mjs` and `src/core/Base.mjs` to understand the framework's class system, config system (getters/setters), and lifecycle hooks. Do not assume standard JavaScript property behavior."

**Why this is required:**
Without this context, sub-agents will hallucinate bugs where none exist (e.g., claiming `this.store` is undefined because they don't see an explicit assignment, missing the fact that it's a reactive config managed by `Neo.core.Base`).

## 20. The Visual Verification Protocol (Frontend UI/Layout Tasks)

**Context:** Agents often "hallucinate" layout behavior based on static SCSS/JS analysis, leading to "shotgun debugging" (guessing fixes) that wastes turns and frustrates users. This protocol applies **exclusively to frontend UI and layout tasks**, not backend MCP server logic.

**Mandate:** You are **FORBIDDEN** from modifying CSS or Layout Configs based solely on static code analysis when a visual bug (e.g., "cut off", "misalignment") is reported.

**Workflow:**
1.  **Stop & Observe:** Do not propose a fix immediately.
2.  **Inspect Runtime State:** Use the `neural_link` tool suite to verify physical DOM constraints and structural VDOM intent:
    -   `find_instances`: Locate the component.
    -   `get_computed_styles`: Check `width`, `height`, `flex`, `display`, `overflow`.
    -   `get_dom_rect`: Check actual dimensions and parent constraints.
    -   `inspect_component_render_tree`: Mathematically verify that the generated VNode tree matches your structural expectations before it hits the physical browser DOM.
3.  **Consult the Expert:** If tools are insufficient or the hierarchy is complex, **ASK THE USER**.
    -   *Template:* "I cannot see the parent container's computed styles. Could you please paste the computed `height` and `overflow` of the element wrapping `.my-component`?"
4.  **Verify Assumptions:** Never assume a class like `neo-label` behaves standardly. Verify its computed style.
