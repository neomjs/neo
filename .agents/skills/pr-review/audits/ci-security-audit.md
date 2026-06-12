# CI / Security Checks Audit

Before conducting or posting a formal Pull Request review, you MUST empirically verify the status of GitHub Actions and CI checks. Security bots (like CodeQL) and automated test workflows run asynchronously on GitHub. A static diff review *cannot* catch what these automated tools find. Spending a full review cycle while required CI is failing or incomplete creates avoidable re-review churn.

## The Verification Protocol

1. **Empirical Verification:**
   You must run `gh pr checks <N>` to view the status of all checks for the PR before reading the full diff, scoring metrics, or drafting a substantive formal review. If the command is temporarily unavailable, use an equivalent read-only GitHub status surface and say so explicitly.

2. **Pending/In-Progress Checks:**
   If any checks are pending, queued, or in-progress, you **MUST HOLD** your review. Do not spend or post the full review while the result is unstable. Send a lightweight A2A/PR note only when coordination needs the hold reason.

3. **Failure Handling (Fail-Fast Rule):**
   If any check returned by `gh pr checks <N>` is failing, cancelled, timed out, or marked "deep red", you **MUST STOP BEFORE FORMAL REVIEW**. Do not post `APPROVED`, `REQUEST_CHANGES`, or a full-template `COMMENT` review. The author must fix CI first and re-request review on a green head.

4. **Triage Exception:**
   If the author explicitly asks for CI triage, or the failure is plausibly infrastructure/flaky rather than branch-caused, you may post a limited CI-triage note naming the failing check and next evidence needed. Do not score the diff, audit unrelated surfaces, or treat that note as the formal review cycle.

5. **Approval Block:**
   A PR with failing security or build checks is fundamentally unsafe and cannot be approved, regardless of how clean the diff looks to you.

## Documentation Requirement

When completing `[EXECUTION_QUALITY]`, document the green CI check as a terse fact in the metric justification or verification notes. Do not render a dedicated CI audit section in the formal review template: pending or failing CI stops the formal review before the template exists.

**Example Review Commentary:**
> CI / Security Audit: Ran `gh pr checks 1234`. All workflows (CodeQL, Unit Tests) pass successfully. No deep red flags.
