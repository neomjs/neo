---
id: 7687
title: Enhance GitHub Workflow server robustness when gh cli is not installed
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - MannXo
createdAt: '2025-11-01T18:22:29Z'
updatedAt: '2025-11-10T20:31:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7687'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues:
  - '[x] 7714 ci(testing): gate GitHub-integration tests and add diagnostics polish'
  - '[x] 7713 health(github-workflow): reproduce gh-absent'
subIssuesCompleted: 2
subIssuesTotal: 2
blockedBy: []
blocking: []
closedAt: '2025-11-10T20:31:38Z'
---
# Enhance GitHub Workflow server robustness when gh cli is not installed

The `HealthService` in the `github-workflow` MCP server currently checks for `gh cli` authentication and version. While robust, the server's behavior and error handling when `gh cli` is entirely absent or not in the PATH needs further investigation. This ticket is to thoroughly inspect and enhance the server's startup robustness and error messaging in such scenarios.

## Timeline

- 2025-11-01T18:22:31Z @tobiu added the `enhancement` label
- 2025-11-01T18:22:31Z @tobiu added the `ai` label
### @MannXo - 2025-11-01T18:39:12Z

Hi,
As you mentioned, I have already partially addressed this in #7678 .
I'm happy to work on this ticket as well, if you see fit.


- 2025-11-01T18:45:16Z @tobiu assigned to @MannXo
### @tobiu - 2025-11-01T18:49:30Z

this one definitely makes sense: uninstalling gh cli completely and see if the server handles it.

bigger picture: to get v11 ready, i would like to fully remove siesta. to do this, we need to explore which unit tests and component based tests did not get migrated yet, and tackle them. we also need to update some guides and the agents file itself (i am currently having sessions where gemini fails to use the memory core without several recovery prompts). you are definitely welcome to open new tickets for any topics of interest.

i am already moving new mcp testing files into the playwright folder.

- 2025-11-07T08:28:24Z @MannXo cross-referenced by #7713
- 2025-11-07T08:30:25Z @MannXo cross-referenced by #7714
- 2025-11-07T08:38:20Z @tobiu added sub-issue #7714
- 2025-11-07T08:48:47Z @tobiu added sub-issue #7713
### @tobiu - 2025-11-10T20:31:38Z

closing the epic, since all subs are resolved.

- 2025-11-10T20:31:38Z @tobiu closed this issue

