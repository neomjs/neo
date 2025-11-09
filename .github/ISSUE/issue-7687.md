---
id: 7687
title: Enhance GitHub Workflow server robustness when gh cli is not installed
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - MannXo
createdAt: '2025-11-01T18:22:29Z'
updatedAt: '2025-11-01T18:49:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7687'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - 7714
  - 7713
subIssuesCompleted: 1
subIssuesTotal: 2
---
# Enhance GitHub Workflow server robustness when gh cli is not installed

**Reported by:** @tobiu on 2025-11-01

---

**Sub-Issues:** #7714, #7713
**Progress:** 1/2 completed (50%)

---

The `HealthService` in the `github-workflow` MCP server currently checks for `gh cli` authentication and version. While robust, the server's behavior and error handling when `gh cli` is entirely absent or not in the PATH needs further investigation. This ticket is to thoroughly inspect and enhance the server's startup robustness and error messaging in such scenarios.

## Comments

### @MannXo - 2025-11-01 18:39

Hi,
As you mentioned, I have already partially addressed this in #7678 .
I'm happy to work on this ticket as well, if you see fit.


### @tobiu - 2025-11-01 18:49

this one definitely makes sense: uninstalling gh cli completely and see if the server handles it.

bigger picture: to get v11 ready, i would like to fully remove siesta. to do this, we need to explore which unit tests and component based tests did not get migrated yet, and tackle them. we also need to update some guides and the agents file itself (i am currently having sessions where gemini fails to use the memory core without several recovery prompts). you are definitely welcome to open new tickets for any topics of interest.

i am already moving new mcp testing files into the playwright folder.

