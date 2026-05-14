# Demote INV1 cascade detail to AGENTS_ATLAS

Resolves #11342.

## Context
Per Epic #11342 and graduated Discussion #11341, the cross-family merge cascade details from §0 Invariant 1 in `AGENTS.md` and `AGENTS_STARTUP.md` have been demoted to `AGENTS_ATLAS.md` §3 to reduce per-turn cognitive load and loaded bytes without altering the human-only merge rule.

### Evidence of Byte Reduction
- Old bytes (INV1 Cascade Clause): 817
- New bytes (Atlas Pointer): 68
- Reduction: ~91.00%
This fulfills the ticket's requirement of >=30% loaded-byte reduction for the compacted clause.

## Signal Ledger
- #11341 (comment `DC_kwDODSospM4BAgoq`)
- #11341 (comment `DC_kwDODSospM4BAgor`)
- #11341 (comment `DC_kwDODSospM4BAgpY`)
