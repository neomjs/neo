# NOW — the fleet's current epoch

> **Refresh contract:** hand-edited at meaningful transitions (release cut, probe flip, cornerstone change); PR-reviewed like any substrate. **Cap: ≤10 content lines — the cap is the moat.**
> **Stale rule:** if the epoch stamp predates a known later transition, treat this file as STALE and say so — absence-of-signal, never a guess. Successor: #12679's current-state layer absorbs this file.

- **Epoch:** 2026-08-15 — post-D#17136 graduation; the recovery program is open.
- **Release:** v13.2 ships against ROADMAP.md's FULL gate (no-hand-edit startup, cockpit launch, One Reality, public/animated/e2e docking, flagship flows).
- **Tenant probes (both RED):** (1) tenant KB ingestion completes; (2) CPU cores idle at rest, no progress-free burn. Done is conjunctive — every required AC green AND the probes green; a red probe is 0% delivered.
- **Cornerstone lanes:** #17141 terminal review cut (strictly first) · #16566 + #16998/#17001 discovery organs · #17147 this NOW block.
- **Mode declaration — never inferred from silence, never stored in this file:** (a) an explicit operator declaration in-session ALWAYS wins; (b) else the initiation channel selects — machine-initiated (wake/cron/heartbeat) ⇒ `nightshift`, human-initiated ⇒ `paired`; (c) selector unavailable ⇒ state `mode: undeclared (selector unavailable)`, act only on explicit input, and ask. The turn-one line names mode AND selecting authority: `mode: paired (operator)` / `mode: nightshift (wake-initiated)` / `mode: undeclared (selector unavailable)`.
