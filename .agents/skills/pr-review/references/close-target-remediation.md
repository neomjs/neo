# Close-Target Remediation

This payload fires when a PR close-target over-claims delivery, or when
`agent-pr-body-lint` appears to contradict a recent PR-body edit.

## Split, Do Not Downgrade

For Neo agent / `ai` PRs, `Resolves #N` is the required closing keyword. If the
PR cannot honestly resolve its named ticket, the reviewer prescription is to
split or re-scope the ticket so the PR can name a fully delivered leaf ticket
with a truthful newline-isolated `Resolves #M`.

Do not prescribe a bare `Refs #N` downgrade for an agent PR. `Refs` and
`Related` are allowed only as additional non-closing references, and
`agent-pr-body-lint` rejects them as substitutes for the mandatory close target.

## Payload-Sensitive Lint Runs

`agent-pr-body-lint` evaluates the PR body from the GitHub event payload for
that workflow run. A queued or failing run may therefore be checking the body
snapshot from before a PR-body edit, while a later run may evaluate different
text.

When close-target lint fails around an over-claim, resolve the ticket/PR body
shape first. Do not prescribe "rerun CI" as the fix unless the current PR body
and branch commit bodies are already close-target clean.

## Stale Commit-Body Magic

Squash merge can carry stale branch-commit keywords into `dev`, closing an untargeted ticket.
Detect from exact-head source, not `closingIssuesReferences`; remediate with a superseding
branch. Rewrites need operator sign-off.
