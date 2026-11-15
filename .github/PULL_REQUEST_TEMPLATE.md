<!-- Contributing guide: https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md
     Submit pull requests against `dev` (never `main`).
     Validate locally before opening: npx neo-agent-skills-pr-body --body-file <path-to-body.md> -->

Resolves #

<!-- Exactly one standalone `Resolves #<issue-id>` line (`Closes` and `Fixes` fail CI).
     Only finishing part of an issue? Comment on the issue first so a maintainer can help scope it. -->

<!-- Summarize what shipped, why, and whether it changes public behavior or requires migration (do not copy the ticket body): -->


<!-- Rate achieved vs required Evidence Level L1-L4 (L1 static/docs, L2 unit/spec tests, L3 live probe, L4 operator handoff; see https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/process/evidence-ladder.md): -->
Evidence: L<X> (<what you ran locally or in CI>) -> L<Y> required (<ticket ACs>).

## AC Evidence
| AC | Proof |
|---|---|
| AC-1 | <owning spec path or local command + receipt; or `No structured ACs on #N`> |

## Deltas from ticket
<None substantive, or what changed from the ticket>

## Test Evidence
<All coverage runs in CI, or outside-CI receipts (E2E, visual, live runtime, manual checks)>

## Post-Merge Validation
<None required, or - [ ] checks verifiable only after merge>

<!-- LLM / AI disclosure: if an LLM assisted or authored this PR, specify the exact model, version,
     reasoning effort (write `reasoning: default` if your tool exposes no effort setting), and agent or
     harness on the `Authored by` line below (keep comma-separated; do not join version and effort
     with `/`). Rationale: naming the model, version, and reasoning effort ensures cross-rival-lab
     review routing (every PR naming a model lab is reviewed by a maintainer running a rival lab's
     model). If no LLM was used, write `(no LLM)`. -->
Authored by @<github-handle> (<model + version>, reasoning: <effort or default>, <agent or harness>).
