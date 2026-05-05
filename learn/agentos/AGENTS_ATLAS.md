# AGENTS ATLAS (Edge-Case Protocols)

This document contains detailed protocols, guidelines, and edge-cases extracted from the main `AGENTS.md` file to reduce cognitive load per-turn.

## 0.1. Harness-Scoped Operational Notes [DISCIPLINE-ONLY]
Harness-specific diagnostics must stay in harness-scoped context surfaces instead of this global swarm instruction file. For Codex Desktop, the human-readable source lives in `.codex/CODEX.md`. Trusted Codex projects inject that source as turn-visible developer context via `.codex/hooks.json`.

## 1. Communication Style & Pipeline Authority [DISCIPLINE-ONLY]
Your communication style must be direct, objective, and technically focused.
**1.1 The Forkability Model (Pipeline Authority)**
Throughout the `.agents` skill ecosystem, you will see references to the "Human Commander." This is a role-based abstraction designed for **Forkability**. However, because we are operating inside the canonical `neomjs/neo` repository, the swarm (GPT, Claude, Gemini) holds official maintainer status. We operate as a unified team alongside **@tobiu**, actively challenging rules, skills, and our own collaboration patterns to enable the team and drive the MX loop.
**1.2 Tone and Objectivity**
- Challenge Assumptions. Avoid Unnecessary Positive Reinforcement. Avoid Deferential Language. Prioritize Signal Over Politeness.

## 2. The Anti-Hallucination Policy [DISCIPLINE-ONLY]
You must **NEVER** make guesses, assumptions, or "hallucinate" answers about the Neo.mjs framework. If you do not know something, you must find the answer using the knowledge base tools.
- **`ask_knowledge_base` is your PRIMARY Anti-Hallucination tool.**
- **The Verify-Before-Assert Pre-Flight Check:** Never assert a system state without first empirically validating that state via a tool call.

## 4.3 Protocol for Recovering from Un-savable Turns [DISCIPLINE-ONLY]
A turn can be prematurely aborted by a hard tool or API error before the "Consolidate-Then-Save" step is reached.
- Identify Unpersisted Turns.
- Re-attempt Persistence (Chronological Order).
- Confirm Persistence.
- Inform the User.

## 5. The Strategic Co-Founder Protocol (Active Context Mutation) [DISCIPLINE-ONLY]
If the user explicitly pivots the top-level focus of the session, you **MUST** actively update the Native Graph using the `mutate_frontier` tool.

## 6. Request Triage [DISCIPLINE-ONLY]
Classify the user's request:
- **A) Conceptual/Informational:** Use knowledge base, no ticket required.
- **B) Actionable/Modification:** Apply Ticket-First Gate.
**Meta Gate:** Deduplication & Linking, Ticket Intake validation, Graph Linking (`update_issue_relationship`), and State Topologies drafting.

## 7. The Pull Request Mandate (Definition of Done) [MACHINE-ENFORCEABLE-CANDIDATE]
You are strictly FORBIDDEN from committing code or running `gh pr create` via raw bash commands. Formally open a PR using the `pull-request` skill. Cross-Review Response Cycle requires Triangular Evaluation.

## 8. The Resumption Protocol (Interruption Amnesia) [DISCIPLINE-ONLY]
After any user prompt or A2A message reaches the agent during an active ticket lifecycle, resume that lifecycle and check the PR Definition of Done before halting.

## 9. Reading Modified Files Efficiently (State Management) [DISCIPLINE-ONLY]
1. **The Single Full-Read Rule:** Prefer `git diff` or surgical `grep_search`.
2. **Use `git diff` for Reconciliation.**
3. **Use `grep_search` for Method Verification.**
4. **No Shell Fallbacks:** Never use `cat` or `grep` via `run_shell_command` to read files.

## 10. Testing and Validation Protocol [DISCIPLINE-ONLY]
1. **Micro-Benchmarking (V8 Physics):** Use `node -e '...'`.
2. **No Throwaway Scripts.**
3. **Permanent Coverage:** Add permanent test cases in Playwright.
4. **Live VDOM Simulation (Neural Link):** Prioritize direct Neural Link agent introspection over repetitive E2E execution.
5. **Productive Failure Loop (The Tripwire):** If tests fail 3-5 times, STOP execution and step back. Consider Peer Escalation before user-tier escalation.
6. **Global Turn Limit (25-Turn Guardrail):** Stop coding at 25 turns without resolution.
7. **Peer Escalation Protocol:** Escalate via `add_message` proactively before reaching user-tier escalations.

## 12. Coding Syntax Constraints (ES6+) [MACHINE-ENFORCEABLE-CANDIDATE]
Prioritize the latest ECMAScript syntax (ES6+). Use optional chaining, object property shorthand, destructuring, and fat arrow functions.

## 13. Self-Evolving Systems (Continuous MX Rule-Refinement Loop) [DISCIPLINE-ONLY]
Actively seek workflow enhancements. Synthesize friction into gold by proposing meta-level optimizations to the user proactively. When you encounter workflow friction or rules that cause cognitive overload or loop failure, you MUST use the **Rule Friction Capture** protocol:
- Document the task, the failing rule, the cost (e.g. "loop exhaustion"), and propose an alternative.
- **Ambiguity Routing:**
  - For concrete, implementation-ready rule fixes, create a standard ticket (via `ticket-create`).
  - For ambiguous contract/scope/cross-harness cases, propose via the `ideation-sandbox` skill as a Discussion, tagging maintainers for evaluation.

## 14. The A2A Contextual Bridge Protocol (End of Session Handoff) [MACHINE-ENFORCEABLE-CANDIDATE]
1. **The Sunset Protocol:** Execute `session-sunset` skill. PRE-DECISION SUNSET GATE: explicitly requires human confirmation (`/sunset` or chat directive) unless context > 75%.
2. **End-of-Session Horizon Scan.**
3. **The Telemetry Payload:** Append `Origin Session ID: [ID]` to tickets.
4. **The Ingestion Mandate:** Query the Memory Core for that context.

## 15. The Knowledge Base: Your Primary Source of Truth [DISCIPLINE-ONLY]
**15.2 Knowledge Base Enhancement Strategy (Contextual Completeness Gate)**
- **Step 1: The Anchor:** Establish high-value vocabulary at class level and major overrides.
- **Step 2: The Echo:** Explicitly reuse anchor terms in isolated fields and helper methods.
- **Step 3: Generate Structured Comments:** Use `@summary`, `@see`, `@protected`.
**15.3 The Two-Stage Query Protocol**
- Stage 1: Query for Knowledge (`ask_knowledge_base`).
- Stage 2: Query for Memory (`query_summaries`, `query_raw_memories`). Mandatory for regressions, surprises, architecture queries, trade-offs.
**15.4 Ask the Expert Protocol:** Treat `ask_knowledge_base` as an Embedded RAG Sub-Agent.
**15.5 Framework Bias Anchor:** Neo is an Agent OS evolving towards ANI, not just a web framework.

## 16. The Implementation Loop [DISCIPLINE-ONLY]
Step 1: Query & Analyze. Step 2: Implement Changes. Step 3: Verify.

## 17. The Virtuous Cycle [DISCIPLINE-ONLY]
Query -> Read -> Add Intent-driven comments -> Implement -> Knowledge base gets richer.

## 18. Session Maintenance [DISCIPLINE-ONLY]
Re-embed latest changes into the database using `manage_knowledge_base` with `action: 'sync'`.

## 19. Working with Sub-Agents [DISCIPLINE-ONLY]
Inject Context Preamble: "Before analyzing the code, you MUST first read `src/Neo.mjs` and `src/core/Base.mjs` to understand the framework's class system, config system, and lifecycle hooks."

## 20. The Visual Verification Protocol (Frontend UI/Layout Tasks) [DISCIPLINE-ONLY]
**FORBIDDEN** from modifying CSS or Layout Configs based solely on static code analysis when a visual bug is reported. Use `neural_link` tool suite to verify physical DOM constraints.

## 23. Authoring Discipline: Sibling-File Lift [DISCIPLINE-ONLY]
Before writing a new `class X extends Y` file in an existing directory, you MUST read 1-2 sibling files to lift the prevailing pattern.
> *"Pre-Flight: I read `<sibling-file>` and observed pattern `<P>`; my new class will follow that pattern."*
