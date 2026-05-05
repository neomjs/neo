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
