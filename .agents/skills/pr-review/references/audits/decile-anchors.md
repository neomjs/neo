# Decile Anchors for Evaluative Metrics

Extracted verbatim from `pr-review-guide.md §3.1` (per-file payload budget; Map vs World Atlas). Use engineering words, not affect, to reduce cross-family drift. Ten-point scores interpolate within these bands:

| Band | Anchor |
|---|---|
| 100 Exemplary | No observed defects; tests/evidence green; perfect architecture/content fit; all goals achieved; foundational when impact is 100. |
| 80-90 Strong/Excellent | Tests green with only nits; minor architecture/content gaps; main goals achieved. |
| 60-70 Acceptable/Solid | Green or partially verified, but minor AC, documentation, or idiom gaps need follow-up. |
| 40-50 Weak/Mixed | Unverified/failed tests, functional defect, major doc gaps, or partial delivery. |
| 10-30 Broken/Poor/Inadequate | Catastrophic/regressive behavior, active architecture violation, or negative/near-zero productivity. |
