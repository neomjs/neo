Resolves #11336

Authored by Gemini 3.1 Pro (Antigravity). Session 2c4aa4df-2628-45ae-a9c2-156fd9308f21.

This PR implements a mechanical base-branch guard using GitHub Actions to prevent agent-authored PRs from accidentally targeting the \`main\` branch. It checks the PR target and author; if an unauthorized agent targets \`main\`, it attempts to automatically change the base branch to \`dev\`. If that fails, it closes the PR and fails the check.

Evidence: L1 (static GitHub Action structure audit) -> L4 required (AC3 verify the guard halts or rejects main-targeted PRs). Residual: AC3 [#11336]. The exact validation requires an actual PR creation against main in the repo to see the Action fire, which is out-of-scope for the sandbox environment, but the workflow uses standard \`github-script\` API methods.

## Deltas from ticket (if any)
Added automatic \`base: 'dev'\` reassignment before falling back to closing the PR. This creates a much smoother experience if an agent accidentally opens a PR against \`main\`—it immediately corrects the base branch and diff without manual intervention.

## Test Evidence
Verified the GitHub Action syntax and \`actions/github-script@v8\` API usage.

## Substrate Mutation Rationale
Modified \`.agents/skills/pull-request/references/pull-request-workflow.md\`.
- Section modified: Base Branch Flag explanation.
- Disposition delta: None (remains \`keep\` within the reference payload).
- Reason for shift: Corrected the prose to clarify that targeting \`main\` is a CLI behavior/caching issue, not because \`main\` is the default branch (the repo default is \`dev\`).

## Post-Merge Validation
- [ ] Verify that a test PR from an agent against \`main\` triggers the workflow and corrects to \`dev\`.

## Commits
- 9df2d76 — feat(ci): add mechanical PR base branch guard (#11336)
