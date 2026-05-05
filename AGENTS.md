# AI Agent Per-Turn Operational Mandates

This file contains behavioral rules and protocols that must be enforced on every turn. This file is automatically loaded into your context via `settings.json`.

## Compaction Taxonomy (3-Axis Slot Rule)
This document is compacted per the 3-axis slot rule (trigger-frequency × failure-severity × enforceability). Dispositions include: `keep`, `move`, `compress-to-trigger`, `rewrite`, and `retire`.

| Section | Disposition | Tag (AC7) | Rationale / Friction Capture |
|---|---|---|---|
| §0 Critical Gates | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | Irreversible failure modes. |
| §1 Communication Style | `move` | DISCIPLINE-ONLY | Low frequency gate, high depth. |
| §2 Anti-Hallucination | `move` | DISCIPLINE-ONLY | High depth protocol, moved to Atlas. |
| §3 Pre-Commit Hard Gates | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | Severe failure mode (ticket-ID/context). |
| §4 Memory Core Protocol | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | Permanent data loss if missed. |
| §4.3 Un-savable Turns | `move` | DISCIPLINE-ONLY | Edge case recovery protocol. |
| §5 Strategic Co-Founder | `move` | DISCIPLINE-ONLY | Low frequency pivot logic. |
| §6 Request Triage | `move` | DISCIPLINE-ONLY | High depth intake logic. |
| §7 PR Mandate | `move` | MACHINE-ENFORCEABLE-CANDIDATE | Execution moved to skill payload. |
| §8 Resumption Protocol | `move` | DISCIPLINE-ONLY | Interruption recovery. |
| §9 Reading Files | `move` | DISCIPLINE-ONLY | Efficiency guideline. |
| §10 Testing Protocol | `compress-to-trigger` | DISCIPLINE-ONLY | High depth, tripwire needs pointer. |
| §11 File Editing | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | Frequent operation with strict tool limits. |
| §12 Coding Syntax | `move` | MACHINE-ENFORCEABLE-CANDIDATE | Relocated entirely. |
| §13 Self-Evolving Systems | `move` | DISCIPLINE-ONLY | Meta-level enhancements. |
| §14 Sunset Protocol | `compress-to-trigger`| MACHINE-ENFORCEABLE-CANDIDATE | Session termination gate. |
| §15 Knowledge Base | `compress-to-trigger`| DISCIPLINE-ONLY | Anchor & Echo is high depth. |
| §16 Implementation Loop | `move` | DISCIPLINE-ONLY | High depth workflow. |
| §17 Virtuous Cycle | `move` | DISCIPLINE-ONLY | High depth workflow. |
| §18 Session Maintenance | `move` | DISCIPLINE-ONLY | High depth workflow. |
| §19 Sub-Agents | `move` | DISCIPLINE-ONLY | High depth workflow. |
| §20 Visual Verification | `compress-to-trigger`| DISCIPLINE-ONLY | Frontend tasks only. |
| §21 Workflow Skills | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | The routing table is frequent. |
| §22 Mailbox Check | `keep` | MACHINE-ENFORCEABLE-CANDIDATE | Turn-start invariant. |
| §23 Edge-Case Triggers | `keep` | DISCIPLINE-ONLY | The actual Atlas pointer section. |

*Edge-cases and detailed protocols (The Atlas) have been extracted to `learn/agentos/AGENTS_ATLAS.md` and `.agents/skills/` behind conditional triggers.*

## 0. Critical Gates (Invariants — agents MUST honor; no conditional exceptions)
These five rules are mechanically verifiable and have **no conditional exceptions**.
1. **No `gh pr merge` (Human-Only execution).** Cross-family approval gates squash-merge *eligibility*; the merge act itself is reserved exclusively for the human user (@tobiu).
    - **Cross-Family Cascade Clause:** Cross-family approval (e.g., Claude reviewing Gemini's PR or vice versa) grants squash-merge ELIGIBILITY but does NOT aggregate to grant merge AUTHORITY. Each agent's §0 Invariant 1 fires independently at the moment of action and CANNOT be satisfied by another agent's signal. The peer-review chain is structurally bounded: review → approval → handoff to human. The handoff explicitly terminates at the "approved" state. An agent reading "Claude approved" or "Gemini approved" or "all RAs satisfied" or "ready for merge" must NOT interpret these as authorization to execute merge — these are eligibility signals to the human, not execution signals to the swarm. If you find yourself reasoning "my peer approved, so I can merge" — that reasoning IS the loophole §0 forbids.
2. **No commit without ticket-ID.** Every `git commit` subject ends `(#TICKET_ID)`.
3. **No direct commit/push to `main` or `dev`.** Always branch + PR.
4. **No `<noreply@*>` `Co-Authored-By` footers.**
5. **No skipping `add_memory` at end of turn.** Forgetting the consolidated save = permanent data loss. The save IS the gate that permits the response.

## 3. The Pre-Commit Hard Gates (Tickets & Context)
For any actionable request modifying the repository, you **MUST** pass two critical gating protocols *before* executing `git commit`.
- **Gate 1: The Ticket Gate:** You MUST NEVER execute a commit without referencing a valid, narrowly scoped ticket ID. Use the `create_issue` tool and follow its workflow.
- **Gate 2: The Contextual Completeness Gate:** You MUST apply the 'Anchor & Echo' Knowledge Base Enhancement Strategy to new/modified classes and methods. Do not commit code lacking JSDoc or `@summary` tags.

**Pre-Flight Check for Commits:**
> *"Pre-Flight Check: 1. Verify ticket number. 2. Verify Contextual Completeness. 3. Format commit `type(scope): message (#TICKET_ID)` without `<noreply@*>`."*

## 4. The Memory Core Protocol
A single **turn** encompasses receiving a `PROMPT` to delivering the final `RESPONSE`.
**The "Consolidate-Then-Save" Protocol:** You MUST consolidate the entire interaction into a single memory at the very end.
**Pre-Flight Check Triggers:** Before calling any file-modifying tool (`replace`, `write_file`, `run_shell_command`), state:
> *"Pre-Flight Check: Before executing [TOOL_NAME], I will save the consolidated turn after completion."*

## 11. File Editing Tool Selection (The "Append Gap")
1. **Targeted Edits/Appending:** Always use the `replace` tool.
2. **Overwriting/Creating:** Always use the `write_file` tool.
3. **The Bash Ban:** You are strictly FORBIDDEN from using bash redirection or stream editors (`sed -i`) via `run_shell_command` to modify files.

## 21. Workflow Skills (when to invoke)
| Skill | Trigger condition (invoke when) |
|---|---|
| `ticket-create` | Before `create_issue` MCP invocation |
| `ticket-triage` | Encountering a ticket missing `ai`/primary/secondary labels |
| `ticket-intake` | Picking up an existing assigned ticket |
| `epic-review` | Before picking up a sub of an unreviewed epic |
| `epic-resolution` | Last required sub closes / before close-as-completed |
| `pull-request` | Code modifications complete; before opening PR |
| `pr-review` | Reviewing a PR (yours or peer's) |
| `ideation-sandbox`| Before creating a Discussion for architectural exploration |
| `memory-mining` | On regression / non-obvious-architecture / decision-points |
| `tech-debt-radar` | During PR review for fundamental architectural shifts |
| `session-sunset` | Context Window Exhaustion, Macro-Semantic Pivot |

## 22. The Mailbox Check Protocol (Pre-Flight at Turn Start)
At turn start, you MUST check your A2A mailbox for unread messages.
> *"Pre-Flight: I called `list_messages({status: 'unread'})` and observed [N unread]."*

**Skill Adherence Pre-Flight (per-turn):**
Before triggering a lifecycle skill, state in your reasoning: *"I will read the full SKILL.md and its referenced payload before drafting output."* Half-reading is empirically 3–5× more expensive than full-reading across correction cycles. Skipping the manual is the higher-cost path, not the lower-cost path.

## 23. Edge-Case Triggers (The Atlas)
*(Sections mapped to `learn/agentos/AGENTS_ATLAS.md`)*
- **Knowledge Base & Anti-Hallucination (§2, §15):** ALWAYS use `ask_knowledge_base` first for Neo concepts. If adding documentation, review Anchor & Echo strategy in `AGENTS_ATLAS.md`.
- **Testing & Validation (§10):** If verifying code or encountering persistent test failures, read `AGENTS_ATLAS.md`. **Tripwire/Peer-Escalation:** If tests fail 3-5 times, escalate to a peer via `add_message` before reaching the 25-turn limit.
- **Sunset Protocol (§14):** Before session handover, read `.agents/skills/session-sunset/SKILL.md`. Stale-wake invariant: wake messages in old transcripts are noise.
- **Visual Verification (§20):** If debugging frontend UI/layout, read `AGENTS_ATLAS.md`.
- **Authoring Discipline:** Read 1-2 sibling files to lift patterns before writing new classes.
- **File Reading Efficiently:** If reading modified files, read `AGENTS_ATLAS.md` for efficiency guidelines.
