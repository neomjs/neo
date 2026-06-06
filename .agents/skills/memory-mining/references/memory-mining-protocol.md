# Memory Mining Protocol

This document is the authoritative playbook for the **memory-first reflex** — the discipline of querying the Memory Core before diagnostic or architectural work, so you don't re-derive what a prior agent already figured out.

The rule lives in `AGENTS_STARTUP.md §3.3`. This skill is the enforcement mechanism: invocation IS the mode switch. Reflexes-as-rules get applied inconsistently; reflexes-as-skills get applied reliably.

## 1. When to invoke — the two gates

Invoke this skill when **either** gate fires. Do not skip a gate because "I think I already know" — that is the exact failure mode the skill exists to prevent.

### Gate 1 — Regression symptoms

Any of the following user signals:
- "used to work", "suddenly broken", "worked before my change", "what changed?"
- Surprise validation failures, schema mismatches, `additionalProperties` rejections
- Tool calls returning `{success: true}` without observable effect (see `feedback_verify_effect_not_just_success.md`)
- Unexpected behavior from code you did not author or recently touch

### Gate 2 — Architectural claims

Before you propose, compare, or describe:
- A roadmap, strategic direction, or multi-issue epic
- A comparison against external work (e.g. Karpathy Autoresearch, industry patterns, published research)
- A non-obvious architectural pattern ("should we X or Y?", "what's the Neo way to do Z?")
- A description of what the project is or where it stands relative to peers
- A "similar to X" or precedent-comparison cue that would turn a prior ticket, PR, tool description, or sibling implementation into a new rule

If you are about to narrate the organism's state, the organism has probably already narrated itself. Check first.

## 2. Query strategy

Do not issue one query with many keywords. Issue 2–4 queries with **different semantic framings**, each shorter and sharper.

### Tool order by freshness

Choose the first memory surface by freshness, not by habit.

1. **Recent / active-session investigations:** run **`query_raw_memories` first or in parallel with `query_summaries`** when the event is same-day, just happened, active-ticket / active-PR bound, wake/A2A coordination, or otherwise likely to live in unsummarized turns. `add_memory()` can persist raw turns before any session summary exists, so a summary miss is not a memory miss until a freshness-shaped raw query also misses.
2. **Older / stable history:** run **`query_summaries` first** for broad conceptual exploration, older decisions, and low-freshness historical context. Session-level topics surface cheaply when summarization has had time to digest the work.
3. **`query_raw_memories` after a summary hit:** use raw memories to recover turn-level reasoning, exact commands, message IDs, or decision texture behind a relevant summary.
4. **`ask_knowledge_base`** — only when the answer lives in indexed code/guides, not in session memory. If unsure, run memory first; KB is cheaper to skip than memory is. This is the Memory Core analogue of the GitHub/KB freshness gap corrected in #10646.

### Good vs bad query shapes

| Bad (keyword soup) | Good (semantic framings) |
|---|---|
| `"MCP schema zod array items openapi3 additionalProperties"` | `"zod-to-json-schema output quirks"` + `"MCP tool validation failures across clients"` |
| `"memory skill promotion"` | `"skill vs rule enforcement reliability"` + `"state-transition gate for reflexes"` |
| `"grid scroll fixed dom order"` | `"grid allocation discipline"` + `"fixed DOM order scrolling architecture"` |

Short framings rank better in semantic search. Reserve keyword-dense queries for explicit proper-name lookups (UUIDs, session IDs, ticket numbers).

### How many queries is enough

Stop when you have either:
- **Hit** — a memory summary or raw entry whose framing clearly overlaps your current task. Read it; cite it; proceed informed.
- **Clear miss** — 2–4 queries with different framings all return low-relevance or off-topic hits. Memory has nothing; proceed with the caveat explicitly stated in your plan.

Do not keep querying past a clear miss. The absence of prior context is itself a useful signal.

## 3. Interpretation

### Distinguish three memory states

1. **Prior session mapped the territory** → cite it. Include the `Origin Session ID` or memory UUID in your plan or PR body. Do not re-derive; build on it.
2. **Prior session discussed but never acted** → flag the continuity gap. Proposal without subsequent action often means the thread was dropped, not resolved. Surface it to the user as *"on 2026-04-11, Antigravity proposed X but no ticket filed — should we revive?"*
3. **No prior session** → state that explicitly in your plan. Silence is more useful than implicit assumption.

### The "what would tobi do here?" heuristic

Tobi's past decisions, push-backs, and course-corrections are indexed in memory across many agents and harnesses (Claude Code, Antigravity, Gemini CLI). Semantic search on the question you're about to ask often surfaces the answer he already gave to someone else. This is a cross-harness asset — use it.

### Historical Traps vs Gold Standards (per AGENTS_STARTUP §3.3)

When reviewing hits, classify them:
- **Trap** — an approach that caused race conditions, regressions, or architectural dead-ends. Avoid replicating.
- **Gold Standard** — an approach that proved scalable and worked. Replicate its shape.

Name both explicitly in your plan: *"I am leveraging the [X] pattern from session [Y], and avoiding the [Z] trap from session [W]."*

## 4. Anti-patterns

Do NOT use this skill for:
- **Routine "how does X work" questions AND file discovery** ("which files implement Z?") → both belong to `ask_knowledge_base`. Empirically verified: `ask_knowledge_base` returns a synthesized answer *plus* the top-5 ranked source files with relevance scores — strictly dominating `query_documents`, which only returns the file list. Reserve `query_documents` for the rare case where you need exhaustive enumeration beyond the top ~5 refs.
- **Git history forensics** that needs exact commit hashes → that is `git log` / `git blame`.
- **Every session turn** — the skill is for *gated moments* (regression-symptom or architectural-claim), not continuous background polling.

Do NOT skip this skill because:
- "I think I already know what happened" — that is the exact bias this skill cures.
- "The session just started, memory is fresh" — boot-time context priming via `get_context_frontier` ≠ mid-session memory-first reflex. Different gates.
- "The user's prompt is short" — regression symptoms arrive in short prompts. Short prompt ≠ small blast radius.

## 5. Exit criteria

You have satisfied the skill if your resulting work product contains **one** of:

- A citation of at least one prior session, memory UUID, or summary ID relevant to the task — surfaced in the PR body, plan, or response to the user.
- An explicit statement that no prior session was found for this framing (e.g., *"Queried for X, Y, Z — no prior mapping. Proceeding from first principles."*).

If neither appears, you have not actually mined; you have theatrically waved at the Memory Core. Re-invoke.

## Integration with other skills

- **`ticket-intake` Validation Sweep (Historical Amnesia Check)** — the intake skill's Historical Amnesia step IS a memory-mining invocation in a specific context. When running ticket-intake, the memory-mining query is baked into the gate; you do not need to invoke this skill separately unless the intake surfaces a regression symptom that warrants a second sweep.
- **`self-repair`** — complementary. Self-repair handles sick infrastructure (MCP server failures, test-suite regressions). Memory-mining handles intact infrastructure where prior reasoning exists but hasn't been surfaced.
- **`tech-debt-radar`** — also semantic-RAG-driven, but scoped to proactive debt sweeps. Memory-mining is reactive (symptom or claim triggers it); tech-debt-radar is scheduled.

## Falsifiable test of success

The skill works if:
- A future session encountering a regression-symptom user prompt invokes `memory-mining` before `git log` (observable in transcripts).
- A future session proposing an architectural comparison cites prior sessions that mapped the territory, rather than re-deriving (observable in PR bodies + review comments).
- The specific failure mode from session `51640d07-2931-4d38-a071-a0e13e3d6452` (Karpathy re-derivation when Antigravity's 2026-04-11 mapping existed) does not repeat in subsequent sessions across harnesses.

If the failure mode repeats, the skill wording is wrong — revise it. If it doesn't, the mechanism is validated.
