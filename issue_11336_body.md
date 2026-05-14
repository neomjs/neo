### Context
Agent-authored PRs occasionally target `main` instead of `dev`, bypassing the `AGENTS.md` §0 invariant against merging to `main`. While `.agents/skills/pull-request/references/pull-request-workflow.md` mandates `--base dev`, it is a conditionally loaded skill payload and does not prevent CLI or UI overrides targeting `main`. Note: the repository default branch IS `dev`, so PRs targeting `main` occur via explicit misdirection or stateful CLI/UI bugs, not because the repository defaults to `main`.

### The Problem
During PR #11335, the PR creation incorrectly targeted `main`, generating a 10,000+ commit delta in the GitHub UI despite the repo default being `dev`. This causes "base-main blowups", requiring urgent drop/supersede or in-place edit actions and wasting swarm cycles.

### The Architectural Reality
The GitHub Workflow MCP server's tools or the raw `gh pr create` command does not mechanically enforce a `--base dev` guard for agent PRs. We need a mechanical guard in CI or the MCP tool itself to catch misdirections before they waste team effort.

### The Fix
Implement a mechanical base-branch guard. Options include:
1. A GitHub Actions workflow (`.github/workflows/`) that fails the check immediately if a PR from a known agent (or any non-release PR) targets `main`.
2. A check inside the MCP `github-workflow` server wrapping PR creation that halts if `base != dev` (unless explicitly flagged for a release).

### Acceptance Criteria
- [ ] Investigate whether a CI Action or an MCP tool wrapper is the safer substrate.
- [ ] Implement the base-branch guard enforcing `dev` as the base for agent PRs.
- [ ] Verify the guard halts or rejects `main`-targeted PRs with a clear error message.
- [ ] Update `.agents/skills/pull-request/references/pull-request-workflow.md` to remove the incorrect statement that the repo default branch is `main`.

### Out of Scope
- Changing the repository's default branch.

### Avoided Traps
- Relying solely on `AGENTS.md` text: we learned prose is bypassed by default GitHub CLI behavior. Mechanical friction->gold is required.

### Related
- PR #11335

Origin Session ID: 2c4aa4df-2628-45ae-a9c2-156fd9308f21
Retrieval Hint: "PR #11335 base-main incident mechanical guard"
