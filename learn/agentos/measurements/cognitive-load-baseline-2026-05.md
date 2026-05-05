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

### 1.4 Harness-Native Primitive Outputs (AC0)
- **Antigravity (Gemini 3.1 Pro):** Truncation limit visually confirmed via system block injection (`<truncated 35170 bytes>`). Actual loaded payload capped strictly at ~24,000 bytes.
- **Claude Code:** `/memory` visual verification confirms standard dynamic context aggregation via `CLAUDE.md`.
- **Codex Desktop:** `project_doc_max_bytes` validation and active-instruction audit mechanism deployed for verification.

### 1.2 Correction-Cycle Metrics (AC2)
A lower byte count is a false win if it increases the correction cycles required to achieve compliance.
- **Metric 1:** Request-Changes count per PR.
- **Metric 2:** A2A round-trip count per PR (clarifications, missed pings).
- **Rule:** The "skim-and-revert" trap proves that half-reading a manual is more expensive than full-reading.

### 1.3 Always-Important vs Edge-Case Taxonomy (AC-X1, AC-X2)
Every retained or extracted section must be classified:
- **`always-important`**: Must load on its trigger every time.
- **`edge-case`**: Fires only under narrow conditions. Must be extracted with a gate-pattern pointer: *"If <condition>, read <path>; otherwise skip."*

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
