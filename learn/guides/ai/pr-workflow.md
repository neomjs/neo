# PR Workflow and Review Protocol (for AI + Humans)

This guide centralizes all pull request (PR) workflows and review protocols previously embedded in `AGENTS.md`. Use this when a session involves reviewing, validating, or commenting on PRs.

## Reviewing Pull Requests

When you are asked to review a pull request, follow this workflow to fetch and check out the PR branch locally.

### Steps

1. **Ensure your current work is committed or stashed**  
   Before switching branches, make sure you save your current work to prevent losing changes:
   ```bash
   git status
   git add .
   git commit -m "WIP: save changes"
   # or stash changes
   git stash
   ```

2. **Fetch and check out the pull request branch**
   Use the GitHub CLI command:

```bash
   gh pr checkout <PR_NUMBER>
```
   Replace <PR_NUMBER> with the pull request number you are reviewing.

3. Review and test the code locally  
   Once checked out, review the changes and run any tests or build commands necessary to validate the PR.

4. Return to your previous branch

   After review:
   
```bash
   git checkout -
```

### Example Usage

If you are asked to:

“Review PR RealWorld app: your Profile => my articles #123”

You would run:
```bash
gh pr checkout 123
```

This will fetch and check out the branch for PR #123 so you can start reviewing.

### Safety Notes

- Always commit or stash your changes before checking out a new branch to avoid losing work.
- Ensure the GitHub CLI is installed by running:

```bash
gh --version
```
Install it if necessary:

```bash
brew install gh     # MacOS
sudo apt install gh # Ubuntu/Debian
```

## Pull Request Review Protocol

This section outlines the protocol for conducting pull request (PR) reviews to ensure feedback is consistent, constructive, and aligned with the Neo.mjs project's standards.

### General Guidelines
- Always provide feedback in a **constructive and polite tone**.
- Focus on helping contributors improve their code while maintaining the project's standards.
- Avoid personal criticism; keep feedback objective, actionable, and specific.

### Verification Steps
1. **Check Against Coding Guidelines:**
   - Verify that the PR adheres to the project's coding standards as defined in `.github/CODING_GUIDELINES.md`.
   - Pay special attention to JSDoc comments, formatting, naming conventions, and reactivity rules.

2. **Run Tests:**
   - Execute the project's test suite (e.g., `npm test`) to ensure no regressions are introduced.
   - If tests fail, include the failure details in the review and suggest fixes.

3. **Check Completeness:**
   - Ensure the PR includes all necessary updates, such as documentation, tests, and examples.
   - Verify that the PR description is clear and provides sufficient context for the changes.

4. **Assess Code Quality:**
   - Review the code for readability, maintainability, and adherence to Neo.mjs architectural principles.
   - Ensure the code is free of unnecessary complexity and aligns with the framework's reactivity model.

### Standard Review Comment Format
Use the following format for review comments to ensure clarity and consistency:

1. **Summary of Findings:**
   - Begin with a brief summary of the overall review, highlighting strengths and areas for improvement.

2. **Line-by-Line Comments:**
   - Provide specific feedback for each issue, referencing the relevant line(s) of code.
   - Use the following structure:
     - **What is the issue?**
     - **Why is it an issue?**
     - **How can it be improved?**

### Adding Comments via GitHub CLI
To provide feedback directly on GitHub after reviewing a pull request, you can use the GitHub CLI commands `gh pr review` and `gh issue comment`. These commands allow you to add inline comments or general comments to a pull request efficiently.

#### Using `gh pr review`
The `gh pr review` command is used to add inline comments to specific lines of code in a pull request. This is particularly useful for providing detailed feedback on specific changes.

**Steps:**
1. Identify the pull request number (e.g., `PR_NUMBER`).
2. Use the following command to add an inline comment:
   ```bash
   gh pr review <PR_NUMBER> --comment "<Your comment here>"
   ```

**Example:**
```bash
gh pr review 123 --comment "Consider refactoring this function to improve readability."
```

#### Using `gh issue comment`
The `gh issue comment` command is used to add general comments to a pull request. This is useful for providing overall feedback or suggestions that are not tied to specific lines of code.

**Steps:**
1. Identify the pull request URL (e.g., `PR_URL`).
2. Use the following command to add a general comment:
   ```bash
   gh issue comment <PR_URL> --body "<Your comment here>"
   ```

**Example:**
```bash
gh issue comment https://github.com/<user-name>/neo/pull/123 --body "Great work overall! I have added some inline comments for minor improvements."
```

**Best Practices**
- Use `gh pr review` for specific, actionable feedback on code changes.
- Use `gh issue comment` for high-level feedback or general suggestions.
- Ensure comments are constructive, polite, and aligned with the project's coding standards.
- Double-check the pull request number or URL before submitting comments to avoid errors.

## Listing GitHub issues and PRs
This section provides instructions for the agent to check and summarize open GitHub issues and pull requests, giving an overview of ongoing work in the repository.

### Using the `gh issue list` command
The `gh issue list` command is used to get an overview of open issues and understand the current status of ongoing work in the repository.

1. To list all open issues in the repository, run:
   ```bash
   gh issue list
   ```

2. To search for issues related to a specific topic or area, use the `--search` flag:
   ```bash
   gh issue list --search "dashboard"
   ```

Use the `gh issue list` command when asked questions like:
- “Can you show me all ongoing issues?”
- “Give me an overview of the current issues.”
- “Show me issues about authentication.”
- “Are there any issues related to the dashboard?”

#### Best Practices
- Summarize the issues for the user, highlighting titles and numbers.
- Avoid returning raw command output unless explicitly requested.

### Using the `gh pr list` command
The `gh pr list` command is used to get the list of open pull requests from a repository. This can be used to get an overall understanding of the ongoing development work.

1. To list all open pull requests in the repository, run:
   ```bash
   gh pr list
   ```

2. To search for pull requests related to a specific topic or area, use the `--search` flag:
   ```bash
   gh pr list --search "topic"
   ```

Use the `gh pr list` command when asked questions like:
- “What pull requests are currently open?”
- “Can you show me all ongoing PRs?”
- “Show me PRs about authentication.”

#### Best Practices
- Summarize the PRs, including key details such as number, title, author, and status.
- Provide a concise overview of active development without showing raw command output.