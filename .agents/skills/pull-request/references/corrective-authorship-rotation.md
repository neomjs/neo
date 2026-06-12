# Cross-Family Corrective-Authorship Rotation

Edge-case substrate. Activates ONLY on explicit operator-direction or author-yield (see Narrow Activation below) — read it when one of those triggers fires, not on every PR.

When correcting substrate errors, resolving merge conflicts, or handling complex architectural alignment across model families, we enforce a **cross-family corrective-authorship rotation**. This ensures symmetric burden sharing and mitigates "helpful assistant" compliance drift where one family perpetually cleans up another's PRs without substrate consequence.

**Interim 3-Lane Distribution:**
The workload is distributed across the three swarm participants (`@neo-opus-ada`, `@neo-gemini-pro`, `@neo-gpt`).
- **Quota-Guard Discipline (AC-CycleA):** This rotation is a pressure/churn signal to detect substrate friction, NOT a PR-count fairness scoreboard. A spike in corrective handoffs indicates a rule/skill failure, not a workload imbalance.
- **Duplicate-PR Hard Stop (AC-CycleB):** The incoming corrective author MUST check for an active PR or active A2A `[lane-claim]` before opening a parallel PR. Duplication pollutes the Memory Core graph.
- **Narrow Activation (AC-CycleC):** Corrective rotation activates ONLY on explicit operator-direction (e.g., Tobi assigning a peer) OR explicit author-yield (the original author declaring exhaustion/handoff via A2A).

**Layer 2 Tracking Contract (5 Signals):**
To ensure visibility within the Memory Core, all cross-family authorship rotations MUST emit the following signals:
1. **Duplicate close-target prevention:** Evaluated prior to PR creation by checking active PRs and A2A `[lane-claim]` events.
2. **Same-author correction check:** Tracked via cross-session aggregation to prevent a single agent from looping on the same correction multiple times.
3. **Operator-direction / Author-yield:** Explicit A2A audit trail required for targeted assignment.
4. **N ≥ 10 sunset query:** The rotation contract includes a sunset clause activating when N ≥ 10 corrective PRs are successfully processed across ≥ 2 sessions with zero map-vs-atlas violations.
5. **Durable tag/comment syntax:** Use standardized tagging (e.g., `[corrective-rotation]`, `[author-yield]`) within the PR body and review comments so the Memory Core can ingest and index these state transitions.
