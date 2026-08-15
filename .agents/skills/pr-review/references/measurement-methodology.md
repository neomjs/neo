# Loaded-Surface Measurement Methodology

This document establishes the empirical baseline methodology for measuring the "loaded surface" of a PR review cycle. This is a prerequisite for Epic #10537 (Modularization of `pr-review-guide.md`) to quantify the exact context cost of the current monolithic architecture versus the proposed modular architecture.

## 1. Core Philosophy: Loaded-Byte Proxy
Token-cost estimates from different models (e.g., Claude vs Gemini) are highly variable and prone to hallucination. Therefore, the **Primary Metric** for measuring the loaded surface is the **loaded-byte count** (`wc -c`), which provides a mathematically verifiable and deterministic proxy for context window consumption.
- **Primary Metric:** `wc -c` (loaded-byte count) of the raw strings ingested.

## 2. Measurement Scope
The loaded surface per review cycle must capture the sum of all components actively loaded into the agent's context window, separated into static (constant framework overhead) and dynamic (PR-specific variability) components.

### 2.1 Cycle 1 (Cold-Cache) Measurement
For the initial review (Cycle 1), the following must be measured and reported:
**Static Surface:**
1. **The Guide:** `wc -c .agents/skills/pr-review/references/pr-review-guide.md`
2. **The Template:** `wc -c .agents/skills/pr-review/assets/pr-review-template.md` (or the specific template used).
**Dynamic Surface:**
3. **The Audit Payloads:** The `wc -c` of any extracted code diffs, conversation histories, and issue bodies ingested to perform the review. Audit payload size varies per review; the per-cycle Dynamic Surface column captures this dimension. Variance is expected, not a measurement defect.

### 2.2 Cycle N (Warm-Cache) Measurement
For subsequent re-reviews (Cycle N), the measurement must capture the delta payload:
**Static Surface:**
1. **The Round-2 Template:** `wc -c .agents/skills/pr-review/assets/pr-review-round-2-template.md` for an ordinary Cycle 2 — the disposition asset is what an ordinary second round actually loads. Measure `pr-review-followup-template.md` instead only for the exceptional shapes that still use it (a validated Drop+Supersede or a guarded repair-minted re-entry). Measuring the follow-up asset for every Cycle N overstates the warm-cache surface, because the ordinary case no longer loads it.
**Dynamic Surface:**
2. **The Delta Payloads:** The `wc -c` of new commits, new conversation comments, and any re-grounding context fetched.

## 3. Baseline Data Capture
Before any pilot extraction (Sub-issue 2 of Epic #10537) can begin, we must capture a **minimum of 10 cycles** of baseline data. If statistical variance remains high at n=10, capture will extend to n=15 or n=20 before proceeding, to avoid extracting based on noisy or atypical cycle data.
- The recorded data must be appended to the dedicated tracking file: `learn/agentos/measurements/pr-review-baseline-2026-04.md`.
- **Gating Mechanism:** Sub-issue 2 (Pilot extraction of review templates) is strictly blocked until the baseline (per §3 opening) is fully captured and validated.

## 4. Execution Procedure
1. During a PR Review, calculate the `wc -c` of the relevant files and payloads (separating Static vs Dynamic).
2. Log the cycle details, including PR number, Cycle number, Static `wc -c`, Dynamic `wc -c`, and Total `wc -c`.
3. Report the log natively in your PR Review comment as a `Measurement Payload` block. A dedicated aggregator or the author during session sunset will persist it to `learn/agentos/measurements/pr-review-baseline-2026-04.md` to avoid review-time merge conflicts.
