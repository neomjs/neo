# CI / Security Checks Audit

Before granting approval on **any** Pull Request, you MUST empirically verify the status of GitHub Actions and CI checks. Security bots (like CodeQL) and automated test workflows run asynchronously on GitHub. A static diff review *cannot* catch what these automated tools find. Approving a PR with failing CI checks is a critical safety violation.

## The Verification Protocol

1. **Empirical Verification:** 
   You must run `gh pr checks <N>` to view the status of all checks for the PR.
   
2. **Failure Handling ("Deep Red" Rule):** 
   If any critical checks (especially CodeQL, Security, or main build tests) are failing or marked "deep red", you **MUST NOT** approve the PR.

3. **Required Action Assignment:** 
   If checks are failing, flag the specific failing checks as a **Required Action** in your review. Instruct the author to fix the vulnerabilities or test failures before re-requesting review.

4. **Approval Block:** 
   A PR with failing security or build checks is fundamentally unsafe and cannot be approved, regardless of how clean the diff looks to you.

## Documentation Requirement

When completing the `[EXECUTION_QUALITY]` section of the PR review template, you MUST explicitly document that you ran `gh pr checks <N>` and confirm the checks passed.

**Example Review Commentary:**
> ✅ **CI / Security Audit:** Ran `gh pr checks 1234`. All workflows (CodeQL, Unit Tests) pass successfully. No deep red flags.
