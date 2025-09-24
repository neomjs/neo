# Ticket: Automate GitHub Issue Creation

**Assignee:** Gemini
**Status:** To Do

## Description

To improve the autonomy of our development workflow, we will automate the process of creating a GitHub issue from a local ticket file. This eliminates the current manual steps of creating the issue on the GitHub website and copying the ID back into the local file.

## Goal

Implement a workflow where the agent can use the GitHub CLI (`gh`) to create a new issue and update the local ticket file accordingly.

### Requirements:

1.  **Use GitHub CLI:** The automation will be built around the `gh issue create` command.

2.  **Separate Title and Body:** When creating the issue, the ticket's title must be passed to the `--title` flag, and the ticket's content (excluding the title) must be passed as the body. This avoids duplicating the title within the GitHub issue body.

3.  **Rename Local File:** After the GitHub issue is successfully created and its ID is retrieved, the local markdown ticket file must be renamed to include the issue number as a prefix. The agreed-upon format is: `gh<ID>-<slugified-title>.md`.

4.  **Update File Content:** The new GitHub issue number and URL must be prepended to the content of the newly renamed local file.

### Prerequisites:

The user's environment must have the GitHub CLI (`gh`) installed and authenticated via `gh auth login`.
