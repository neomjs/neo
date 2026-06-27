# PR Micro-Review

*The Cycle-1 blast-scaled light path (pr-review-guide §7). Use ONLY for a MICRO / CONTAINED PR — NONE of the intense triggers (touches an ADR, a new subsystem, a consumed contract, security, or a migration) and a small diff. If ANY intense trigger fires, or the diff is large, use the full template (`pr-review-template.md`) instead — class-first, size-second.*

**Class:** [`micro` | `contained`] — one line: why this is not intense (no ADR / subsystem / consumed-contract / security / migration trigger; small diff).

**Verdict:** [`APPROVED` | `REQUEST_CHANGES`]

**Glance:** the premise + correctness check — is the change the right shape, and is it correct + safe? 1–2 sentences. For `REQUEST_CHANGES`, name the specific code-shape / correctness / safety defect. A micro-review **never spawns a follow-up ticket** — a finding is an inline-fix, a comment, or a same-PR AC.
