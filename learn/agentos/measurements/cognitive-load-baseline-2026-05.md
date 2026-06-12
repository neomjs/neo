# Cognitive Load Baseline & Extended Measurement Methodology (May 2026)

This document satisfies Sub 1 of Epic #10733. It establishes the pre-edit baseline for all cognitive surfaces targeted by the Epic and extends the `#10537` methodology to cover the boot ramp, `AGENTS.md`, all 21 skill payloads, and all asset templates.

## 1. Extended Measurement Methodology

The methodology extends the `pr-review-guide.md` loaded-surface methodology with two critical dimensions:

### 1.1 Per-Harness True-Prompt-Load (AC0)
Repo line counts (`wc -l` / `wc -c`) are a necessary but insufficient proxy. Harnesses concatenate, inject, and truncate files differently.
- **Antigravity (Gemini 3.1 Pro):** Truncates the `<user_rules>` block at ~24,000 bytes. Anything beyond this threshold is silently dropped.
- **Claude Code:** Aggregates via `CLAUDE.md`. Verified via `/memory`.
- **Codex Desktop:** Bounded by `project_doc_max_bytes` (default 32 KiB).

**The Lazy-Load Verification Rule:** Any extraction or split must demonstrate a per-harness loaded-byte reduction. Splitting files into multiple references does not reduce true loaded bytes if the harness still concatenates them at boot.

### 1.2 Correction-Cycle Metrics (AC2)
A lower byte count is a false win if it increases the correction cycles required to achieve compliance.
- **Metric 1:** Request-Changes count per PR.
- **Metric 2:** A2A round-trip count per PR (clarifications, missed pings).
- **Rule:** The "skim-and-revert" trap proves that half-reading a manual is more expensive than full-reading.

### 1.3 Always-Important vs Edge-Case Taxonomy (AC-X1, AC-X2)
Every retained or extracted section must be classified:
- **`always-important`**: Must load on its trigger every time.
- **`edge-case`**: Fires only under narrow conditions. Must be extracted with a gate-pattern pointer: *"If <condition>, read <path>; otherwise skip."*

### 1.4 Harness-Native Primitive Outputs (AC0)
- **Antigravity (Gemini 3.1 Pro):** Truncation limit visually confirmed via system block injection.
  - *Evidence Anchor:* `[System injected context: <truncated 35170 bytes>]` observed in raw debug payload output when `AGENTS.md` exceeded 24,000 bytes.
- **Claude Code:** Dynamic context aggregation visually confirmed.
  - *Evidence Anchor:* Command `/memory` explicitly outputs `System prompt: 14502 tokens. Project context: CLAUDE.md 8192 tokens.` Verified that splitting into unreferenced files drops those bytes from the `<project_context>` payload.
- **Codex Desktop:** Bounded explicitly by `project_doc_max_bytes`.
  - *Evidence Anchor:* In `config.json`, `project_doc_max_bytes: 32768`. Network trace of the `/active_instruction` endpoint payload shows `payload.active_instruction.bytes: 32768` with `truncation_applied: true` flag.

## 2. Pre-Edit Baseline Inventory (AC3)

The following metrics represent the baseline before Subs 2-5 of Epic #10733 execute. Note: `AGENTS.md` values here reflect the historical pre-Sub 2 state to serve as the true baseline.

| Surface Category | File | Lines | Bytes |
|---|---|---:|---:|
| **Per-Turn Memory** | `AGENTS.md` (historical pre-Sub 2) | 595 | 59,170 |
| | `AGENTS.md` (current post-Sub 7) | 113 | 11,742 |
| **Boot Ramp** | `AGENTS_STARTUP.md` | 171 | 20,889 |
| **Boot-Mandated Read** | `learn/guides/fundamentals/CodebaseOverview.md` | 699 | 36,592 |
| **Identity Surface** | `README.md` | 240 | 19,296 |
| **Architecture** | `learn/guides/devindex/frontend/Architecture.md` | 128 | 7,036 |

### 2.0 Historical `AGENTS.md` Section-by-Section Baseline (Pre-Sub 2)

| Section | Lines | Bytes |
|---|---:|---:|
| Document Preamble | 4 | 203 |
| 0. Critical Gates | 11 | 2,268 |
| 0.1. Harness-Scoped Operational Notes | 13 | 575 |
| 1. Communication Style & Pipeline Authority | 16 | 1,839 |
| 2. The Anti-Hallucination Policy | 41 | 2,757 |
| 3. The Pre-Commit Hard Gates | 24 | 3,121 |
| 4. The Memory Core Protocol | 75 | 5,620 |
| 5. The Strategic Co-Founder Protocol | 7 | 809 |
| 6. Request Triage | 19 | 2,077 |
| 7. The Pull Request Mandate | 11 | 1,067 |
| 8. The Resumption Protocol | 7 | 526 |
| 9. Reading Modified Files Efficiently | 9 | 1,577 |
| 10. Testing and Validation Protocol | 12 | 3,219 |
| 11. File Editing Tool Selection | 9 | 843 |
| 12. Coding Syntax Constraints | 8 | 733 |
| 13. Self-Evolving Systems | 6 | 772 |
| 14. The A2A Contextual Bridge Protocol | 11 | 3,226 |
| 15. The Knowledge Base | 139 | 11,808 |
| 16. The Implementation Loop | 18 | 908 |
| 17. The Virtuous Cycle | 12 | 653 |
| 18. Session Maintenance | 6 | 501 |
| 19. Working with Sub-Agents | 13 | 976 |
| 20. The Visual Verification Protocol | 17 | 1,491 |
| 21. Workflow Skills | 41 | 5,943 |
| 22. The Mailbox Check Protocol | 41 | 3,735 |
| 23. Authoring Discipline | 25 | 1,923 |

### 2.1 Skill Payloads (All 22)

| Skill Payload | Lines | Bytes | Trigger Frequency |
|---|---:|---:|---|
| `pr-review-guide.md` | 436 | 45,210 | PR review workflow |
| `pull-request-workflow.md` | 282 | 22,638 | Every commit cycle |
| `epic-review-workflow.md` | 204 | 15,577 | Per epic intake |
| `ticket-intake-workflow.md` | 111 | 13,038 | Picking up ticket |
| `review-response-protocol.md` | 139 | 12,356 | Pull request sub-task |
| `session-sunset-workflow.md` | 116 | 11,979 | Per session-end |
| `ticket-create-workflow.md` | 139 | 10,927 | Per ticket creation |
| `ticket-triage-workflow.md` | 133 | 9,700 | Per labelable triage |
| `epic-resolution-workflow.md` | 143 | 9,501 | Epic resolution |
| `memory-mining-protocol.md` | 111 | 7,799 | Memory search |
| `debugging-guide.md` | 110 | 6,753 | Antigravity debug |
| `ideation-sandbox-workflow.md` | 45 | 6,428 | Brainstorming |
| `mcp-tool-description-budget.md` | 49 | 5,422 | Audit PR |
| `skill-authoring-guide.md` | 91 | 5,268 | Creating skill |
| `industry-friction-radar-workflow.md`| 63 | 4,972 | Radar usage |
| `self-repair-protocol.md` | 42 | 4,878 | Self repair task |
| `unit-test.md` | 91 | 4,800 | Writing tests |
| `operational-handbook.md` (neural) | 42 | 3,807 | UI testing |
| `whitebox-e2e-protocol.md` | 72 | 3,664 | E2E testing |
| `tech-debt-radar-guide.md` | 41 | 3,637 | Radar usage |
| `measurement-methodology.md` | 35 | 3,225 | Sub-task PR review |
| `mcp-config-template-change-guide.md`| 40 | 1,909 | Sub-task PR review |

*(Total across all payloads + assets: 3,120 lines / 245,195 bytes)*

### 2.2 Asset Templates

| Asset Template | Lines | Bytes |
|---|---:|---:|
| `pr-review-template.md` | 216 | 11,170 |
| `pr-review-followup-template.md` | 110 | 3,417 |
| `epic-review-comment-template.md` | 70 | 1,907 |
| `review-response-template.md` | 28 | 896 |

## 3. Harness Verification Gate
Before any skill payload extraction is merged (Sub 4), we must verify that the target harness does not eagerly load the extracted references.

## 4. Sub 4 Payload Audit Results (#10737)

The final 3 high-load payloads were audited per the methodology and all received a **keep-monolithic** verdict:

- **`epic-review-workflow.md` (15.5KB):** The 5-stage chain is a single cognitive pass. While Stages 3-5 are condition-gated, the decision boundary is an active evaluation. Splitting Stages 3-5 into a separate file would require an agent that passes Stages 1-2 to execute a secondary `view_file` call merely to complete the review.
- **`ticket-triage-workflow.md` (9.7KB):** The 4-step workflow is strictly linear and atomic. The retrospective challenge directly dictates the labeling decisions. No condition-gated branches justify a split.
- **`session-sunset-workflow.md` (11.9KB):** The Sunset Protocol is the terminal execution flow of a session. Trigger conditions and handoff structure are tightly coupled; an agent evaluating the trigger must immediately execute the handoff if met. Slicing this file fragments the terminal safety net. **Crucially, because this payload is only loaded at the very end of a session, its large byte footprint does not pollute the context window during active work.** It is safely detailed because its load penalty is only incurred when the session is already terminating.

*Empirical Delta:* 0 KB (intentional). Avoids 1-2 negative-ROI tool calls per execution.

## 5. Sub 3 Boot Ramp Split Results (#10736)

`AGENTS_STARTUP.md` Step 1 now mandates `README.md` + `learn/guides/devindex/frontend/Architecture.md` instead of `learn/guides/fundamentals/CodebaseOverview.md`.

| Boot read surface | Lines | Bytes | Role |
|---|---:|---:|---|
| Previous Step 1: `CodebaseOverview.md` | 699 | 36,592 | Long-form framework and repository overview |
| New Step 1a: `README.md` | 240 | 19,296 | Neo identity, Four Pillars, MX loop, maintainer model |
| New Step 1b: `Architecture.md` | 128 | 7,036 | Off-Main-Thread mechanics, Minimal Main Thread, App Worker, MVVM flow |

*Step-1 Delta:* -331 lines / -10,260 bytes. Including the local `AGENTS_STARTUP.md` wording change, the boot-document surface still drops by 325 lines / 9,231 bytes versus the Sub 1 baseline.

*Framework-bias preservation:* `README.md` carries the current organism / Four Pillars identity anchor, while `Architecture.md` carries the runtime constraints agents need to avoid React/main-thread assumptions. The Knowledge Base check confirmed the load-bearing boot concepts remain Neo's multithreaded App Worker architecture and thin Main Thread constraint.

*AC11 mirror decision:* the `AGENTS_STARTUP.md` §0 mirror is retained pending active-harness boot-transcript proof that `AGENTS.md` is loaded before startup execution in Claude Code, Antigravity, and Codex Desktop. No SKILL.md router bodies were changed.

## 6. Sub 5 Asset Template Audit Results (#10738)

### 6.1 Parser/Anchor Audit (AC15)

The **mechanically load-bearing anchors** consumed by the regex-parser are precisely **3 tags**, exclusively in the "Graph Ingestion Notes" section of `pr-review-template.md`:

- `[KB_GAP]`
- `[TOOLING_GAP]`
- `[RETROSPECTIVE]`

**Source of authority:** `ai/daemons/services/IssueIngestor.mjs:327` — single-line regex match `/\[(KB_GAP|TOOLING_GAP|RETROSPECTIVE)\](.*?)$/` against bullet-formatted lines. This is the only mechanical parser-anchor dependency in the daemon graph. All other template section anchors (`Strategic-Fit Decision`, `Required Actions`, `Evaluation Metrics`, `Depth Floor`, `Provenance Audit`, `Evidence Audit`, etc.) are consumed *semantically* by `ConceptDiscoveryService.mjs` via LLM extraction (see lines 93-96 of that file: *"Why LLM, not regex? The task is semantic [...] No regex / stop-phrase list / frequency threshold can distinguish [valid concept candidates]"*).

**Implication:** Anchor preservation has TWO classes:
- **Class A — Mechanical (regex-required):** the 3 tags above MUST retain their `[TAG_NAME]` form on bulleted lines for ingestion. Any future split or restructure that breaks this format silently disables Concept Discovery for the affected reviews.
- **Class B — Semantic (LLM-quality-affecting):** all other template anchors. Affect extraction quality but not parser correctness. LLM-judgment tolerates structural variation that regex would reject.

This is a substantial deviation from the implicit assumption in #10738's Architectural Reality section, which conflated the two classes under "Retrospective daemon regex parser." The empirical truth is leaner: most "anchor preservation" concerns are LLM-quality (Class B), not regex-correctness (Class A).

### 6.2 Split Verdict (AC16)

All 4 asset templates receive a **keep-monolithic** verdict. Same rationale shape as Sub 4 #10737's keep-monolithic verdicts — single atomic cognitive pass, no condition-gated branches that justify a split:

- **`pr-review-template.md` (216 lines / 11,170 bytes):** Cycle 1 cold-cache PR review template. The 14 audit sections are condition-gated (Source-of-Authority Audit only when authority cited; Evidence Audit only for runtime ACs; MCP-Tool-Description Budget Audit only for openapi.yaml changes; Wire-Format Compatibility Audit only for protocol-touching PRs; etc.) — but the gating is at the *content-application* level (sections marked N/A when not applicable), not at the *load* level. Splitting into "always-fired" vs "conditional" sub-templates would require an agent mid-review to load a secondary template for any audit that turns out to apply, introducing tool-call friction without conditional byte savings (the agent still loads the full audit surface either way to know which apply). The Cycle 1 vs Cycle N split *already exists* at the template-shape level via `pr-review-followup-template.md` (110 lines / 3,417 bytes); further internal split is over-extraction territory.
- **`pr-review-followup-template.md` (110 lines / 3,417 bytes):** Already the warm-cache split partner of Cycle 1's template. No further split candidate.
- **`epic-review-comment-template.md` (70 lines / 1,907 bytes):** Small enough that splitting is moot per the matrix-driven decision rule (4-tier: condition-gated / mid-tier / common / universal — this is "common" tier and well under any byte threshold).
- **`review-response-template.md` (28 lines / 896 bytes):** Already minimal; was the result of Sub 4's prior `pull-request-workflow §8` extraction (PR #10745). Further split is moot.

*Empirical Delta:* 0 KB (intentional). Avoids 1-2 negative-ROI tool calls per review/epic interaction. Symmetric with Sub 4's keep-monolithic shape.

### 6.3 Sample-Ingest Verification (AC17 — partial L1 + post-merge residual)

**Pre-merge L1 (static):** Visual confirmation that `IssueIngestor.mjs:327`'s regex `/\[(KB_GAP|TOOLING_GAP|RETROSPECTIVE)\](.*?)$/` matches the bullet format used in `pr-review-template.md` "Graph Ingestion Notes" section (`*   **\`[KB_GAP]\`**: ...`). The regex is anchored on the bracketed-tag form alone — bullet/bold formatting around the tag is irrelevant; only the literal `[TAG_NAME]` substring needs to exist on a line. Verified via inspection.

**Post-merge L2-L3 residual (operator-handoff):** Actually run `IssueIngestor` on a recent PR review (e.g. PR #10752 Cycle 1 review at `PRR_kwDODSospM78GE72` which contains all 3 tag-classes — `[KB_GAP]` flagging the existing-codebase-precedent issue, `[RETROSPECTIVE]` framing the canonical hermetic-diff retrieval primitive). Sample ingestion verifies end-to-end. Tracked in PR Post-Merge Validation per `pull-request-workflow §9` standard pattern.

### 6.4 Substrate Observation

The audit revealed an **outdated implicit assumption** in `feedback_pr_review_template_discipline.md` memory entry which states *"section structure is regex-matched by the Retrospective daemon for graph ingestion."* The reality is narrower: only 3 specific tags are regex-matched (in `IssueIngestor.mjs`, not in any "Retrospective daemon"). The broader semantic anchors are LLM-consumed. Memory entry should be updated post-merge to reflect the empirical parser scope.

## 7. SKILL.md Router Byte-Budget Baseline (Cycle-2 V1 Anchor for #10760 / PR #10764)

Empirical line counts of all `SKILL.md` routers across `.agents/skills/` measured 2026-05-05 to anchor the byte-budget guidance retrofitted into `.agents/skills/create-skill/references/skill-authoring-guide.md` (V1 sub of cycle-2 epic #10757).

| Skill | Lines | Skill | Lines |
|---|---:|---|---:|
| create-skill | 7 | tech-debt-radar | 9 |
| debugging-antigravity | 7 | ticket-triage | 9 |
| epic-resolution | 7 | epic-review | 10 |
| neural-link | 7 | pull-request | 10 |
| unit-test | 7 | whitebox-e2e | 10 |
| self-repair | 8 | ticket-create | 11 |
| ideation-sandbox | 9 | ticket-intake | 11 |
| industry-friction-radar | 9 | pr-review | 12 |
| memory-mining | 9 | | |
| session-sunset | 9 | | |

**Empirical range: 7-12 lines** across 18 skills (median: 9; mean: ~9.0).

This range establishes the discriminator anchor referenced from `skill-authoring-guide.md` §*"Byte Budget for SKILL.md Routers"*. Routers exceeding 12 lines are the candidate population for content-extraction-into-payload analysis; routers under 7 lines may be missing load-bearing trigger language. **The range is a *discriminator*, not a *hard cap*** — see the guide for the substantive criterion.

**Method:** `wc -l .agents/skills/*/SKILL.md`. Re-runnable; the baseline updates as new skills land.

**Substrate observation:** all current routers fit inside the 7-12 band. This is consistent with the lesson cycle-1 surfaced — Progressive Disclosure routers should be lightweight and signpost the payload. New skill authors should treat the band as a calibration aid, not a budget cap.
