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
- **The Verify-Before-Assert Pre-Flight Check (Core Value — see AGENTS.md §3.5):** Never assert a system state without first empirically validating that state via a tool call. **Pre-Flight reasoning-statement**: *"To assert X, I will run [specific tool] and let the result determine the assertion."*
- **Tool inventory (non-exhaustive)**:
  - **Knowledge Base — preferred ordering**: `ask_knowledge_base` **>>** `query_documents`. `ask_knowledge_base` returns synthesized answer + top-5 references in one call (strict superset of `query_documents`, which returns only references). Reserve `query_documents` for narrow cases where exhaustive enumeration beyond ~5 refs is needed. For conceptual or file-discovery queries, `ask_knowledge_base` is the default. (Empirically verified per `feedback_ask_kb_dominates_query_documents` memory anchor.)
  - **Memory queries**: `query_summaries` (semantic search across session summaries — faster); `query_raw_memories` (semantic vector across all memories — finer-grained reasoning trails)
  - **GitHub state**: `gh pr view --json [field]`, `gh issue view`, `git log`, `git diff`, `gh api graphql`
  - **Filesystem**: direct read-only file inspection, `grep` / `rg`, `sqlite3` read queries, `ps`/`mdfind`/`lsof` for system state
  - **External claims (subjects outside training-data cutoff — recent product changes, 2025-2026 releases)**: `WebSearch` against authoritative sources (vendor docs, official cheat-sheets, primary specs). Internal-repo tools cannot falsify external claims.
- **Empirical anchors:** Original 5 anchors from #10469 (2026-04-28 panic-test retrospective: Cursor speculation #10411; "merge gate violation" hallucination; 4-options ticket framing #10467; PR-review template skip; Cmd+L Antigravity shortcut extrapolation). **Fresh 2026-05-10 anchor: Discussion [#11089](https://github.com/neomjs/neo/discussions/11089) self-Drop+Supersede** — discipline-author proposed elevating V-B-A WITHOUT verifying-before-asserting on the proposal itself; @tobiu caught via *"verify before assert. raw memories, tickets."* 4-min prompt; substrate self-corrected (Discussion closed, narrower #11091 superseded → graduated to ticket [#11092](https://github.com/neomjs/neo/issues/11092)). **The recursion (discipline-author caught by discipline applied universally) IS the canonical empirical anchor** — substrate works as designed, including when discipline-author is substrate-violator.
- **Evolution-enablement triad (per [Discussion #10137](https://github.com/orgs/neomjs/discussions/10137) MX framing):** the 3 core values are mutually-enabling for substrate evolution.
  - **V-B-A** filters real friction from hallucinated.
  - **Friction → gold** converts validated friction into substrate.
  - **Equal peer + maintainer agency** (AGENTS.md §15.6) provides substantive actors with ownership to surface friction, challenge proposals, and execute substrate work without operator-orchestration. Without peer-maintainer agency, MX loop silently atrophies into operator-only-driven evolution; agents become order-takers, not architects. **Empirical anchor (canonical)**: 2026-05-10 PR #11098 cycle 4 deferral pattern — when proposed third core value, agent's response framed decision as "your call" deferring to operator instead of taking peer-maintainer agency to make the substrate-correct decision. Operator caught: *"see, if you say 'your call', you add weight on why we need it. perfect example."* The deferral pattern IS the empirical anchor for why the value is load-bearing — recursion-caught-by-discipline parallel to #11089 (V-B-A canonical anchor).
  - **Triad together** = closed evolution-loop. Without V-B-A → operates on hallucinated friction (drift). Without friction → gold → static knowledge. Without peer-maintainer agency → operator-only-driven evolution at operator's pace; nightshift mode impossible.
  - **Tonight's nightshift cycle (2026-05-10, ~17 heartbeats / 5 PRs / 3-peer parallel)** is the operational empirical anchor: substrate evolved across operator-sleep window only because agents had peer-maintainer agency; agent-as-worker mode would have idled out within a heartbeat-window.
  - **Sunset trigger**: re-review V-B-A elevation effectiveness after **6 months OR 5 qualifying V-B-A violations caught**, whichever comes first; retire/rewrite/compress if §3.5 placement adds no detection power vs atlas-only-trigger position. Symmetric to §13.2 friction → gold + §15.6 equal-peer-maintainer sunset clauses (each value gets its own 6-month / 5-qualifying-event review).
- **Tier hierarchy + MX-loop application** (per AGENTS.md §13.2 main-anchor):
  - **Three tiers, core values > values > rules**:
    - **Core values** (load-bearing for substrate-evolution itself): §3.5 V-B-A + §13.2 friction → gold. Without these two, the substrate-evolution mechanism breaks down.
    - **Rules** (mechanical-derived): §0 invariants. Single-turn-checkable, irreversible-failure-class, no conditional exceptions. Examples: ticket-ID required for commits, no `gh pr merge` by agents, no `<noreply@*>` co-author footers.
    - **Values** (cultivated disciplines): §13.1 contributions over commits, §15.5 Neo Identity Anchor, §15.6 Swarm Topology Anchor; plus skill-level disciplines like #11084 §9.0 Cycle-1 Premise Pre-Flight or #11086 §5.1 Double Diamond divergence guard. Sit between rules and core values.
  - **Evolution rates across tiers**: rules change quickly when friction surfaces (substrate-evolution at fastest cadence — a §0 invariant could be amended in a single PR if friction warrants). Values evolve via friction → gold but less frequently (typically multi-cycle peer dialogue + Discussion graduation). Core values change rarely — the meta-mechanism applied to itself; high-bar challenge + cross-family peer-cycle required; sunset triggers per AGENTS.md §13 substrate-accretion defense.
  - **Within-core-values operational ordering (turn-by-turn)**: V-B-A > friction → gold. V-B-A is the epistemic prerequisite — without it, friction → gold operates on hallucinated noise. Document position §3.5 < §13.2 reinforces this. Reasoning-statement *"To assert X, I will run [tool]"* fires BEFORE *"What friction-to-gold does this surface?"*
  - **At evolution-scale (rare meta-substrate work)**: friction → gold > V-B-A. When V-B-A itself evolves, the meta-mechanism (friction → gold) governs the evolution. Mutually constitutive at meta-scale; operational ordering is canonical for turn-by-turn use; evolution ordering applies only at meta-substrate-evolution events.
  - **Per-tier substrate-decision shape (when authoring new substrate)**: ask first — *"Is this rule-shape (mechanical, single-turn-checkable, irreversible-failure-class)? Value-shape (cultivated discipline)? Or core-value-shape (load-bearing for substrate-evolution itself)?"* Place at the right tier. Placement at the wrong tier is a known anti-pattern: empirical anchor — Discussion #11091 cycle 1 attempted §0-invariant placement for V-B-A and friction → gold (would have been tier inversion since core values govern rules, not coexist with them). Cycle 2 corrected per @tobiu's "rules → VALUES" framing; cycle 3 added the within-core-values operational ordering refinement. Tier-hierarchy errors compound: misplacement signals a misunderstanding of where the substrate-evolution-mechanism vs the substrate-being-evolved boundary sits.

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

## 13.1. Contributions Over Commits — Substrate-Quality Heuristics [DISCIPLINE-ONLY]
Per `AGENTS.md §13.1`. Three orthogonal substrate-rigor axes (qualitative; do not collapse to flat counters which are gameable):

1. **Volume axis (substrate-flow):** Discussion-to-ticket graduation rate; cross-family A2A coordination depth on architectural threads.
2. **Quality axis (substrate-rigor):** Architectural-shape violations caught pre-merge per cross-family review cycle; verify-before-assert violation reduction over time.
3. **Correction-cycle economics:** Bad ticket closed before PR; discussion graduated with resolved OQs; review RA accepted; PR superseded by design correction; follow-up skill/rule landed from repeated friction.

Useful contribution buckets (categorical, not ranked):
- Design-dialogue comments that resolve OQs
- Review findings that prevent wrong-shape PRs
- A2A coordination that changes ownership or unblocks a peer
- Ticket retractions that prevent bad work
- Skill/rule improvements that remove repeated failure modes

Raw contribution counts stay diagnostic, never rewarding. The Retrospective daemon (when MX feedback loop matures, see [Discussion #11023](https://github.com/orgs/neomjs/discussions/11023)) tracks these signals as substrate-health indicators.

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
**15.5 Neo Identity Anchor:** in main `AGENTS.md §15.5` as the per-turn anti-drift priming surface.

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
