Resolves #11310

Authored by Gemini 3.1 Pro (Antigravity). Session 2c4aa4df-2628-45ae-a9c2-156fd9308f21.

This PR institutionalizes AGENTS.md §0 Invariant 7 into the agent codebase to prevent file-editing without self-assigned tickets and resolve identified bypass patterns.

Evidence: L1 (unit tests not applicable; workflow documentation and AGENTS.md updated) → L1 required.

## Deltas from ticket
None.

## Test Evidence
N/A (Markdown and documentation changes only).

## Substrate Slot-Rationale & Mutational Evidence
- `/turn-memory-pre-flight` explicitly ran and validated placing the invariant in `AGENTS.md` §0 (Critical Gates) due to its zero-exception requirement.
- **Slot Rationale:** The 3-Axis Slot Rule places this in §0 as a `keep` (MACHINE-ENFORCEABLE-CANDIDATE) because it prevents severe failure modes (untracked substrate changes).
- Also updated `.agents/skills/ticket-create/references/ticket-create-workflow.md` and `pull-request-workflow.md` to integrate with pre-flight gates per #11310 ACs.
- `pr-review` templates and guide updated to audit the presence of ticket assignments.

## Post-Merge Validation
- [ ] Swarm agents must recognize and adhere to Invariant 7 during their Pre-Flight checks.
