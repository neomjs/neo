<!-- Contributing guide: https://github.com/neomjs/neo/blob/dev/CONTRIBUTING.md
     Submit pull requests against `dev` (never `main`).
     Validate locally before opening: npx neo-agent-skills-pr-body --body-file <path-to-body.md> -->

Resolves #

<!-- Exactly one standalone `Resolves #<issue-id>` line (`Closes` and `Fixes` fail CI).
     Only finishing part of an issue? Comment on the issue first so a maintainer can help scope it. -->

<!-- Summarize what shipped and why in one concise paragraph (do not copy the ticket body): -->


Evidence: L<X> (<what you ran locally or in CI>) -> L<Y> required (<ticket ACs>).

## AC Evidence
| AC | Proof |
|---|---|
| AC-1 | <owning spec path or local command + receipt; or `No structured ACs on #N`> |

## Deltas from ticket
None substantive.

<!-- Replace `None substantive.` above if scope, edge cases, or approach changed during implementation. -->

## Test Evidence
All coverage runs in CI.

<!-- Replace `All coverage runs in CI.` above only with outside-CI receipts (E2E, visual, live runtime, or manual checks). -->

## Post-Merge Validation
- None required.

<!-- Replace `- None required.` above with `- [ ] <check>` items if anything can only be verified after merge. -->

<!-- LLM / AI disclosure: if an LLM assisted or authored this PR, specify the exact model, version,
     reasoning effort, and agent or harness on the `Authored by` line below (keep comma-separated;
     do not join version and effort with `/`). Rationale: naming the model, version, and reasoning
     effort ensures cross-rival-lab review routing (every PR naming a model lab is reviewed by a
     maintainer running a rival lab's model) and calibrates review depth. If no LLM was used,
     write `(no LLM)`. -->
Authored by @<github-handle> (<model + version>, reasoning: <effort>, <agent or harness>).
