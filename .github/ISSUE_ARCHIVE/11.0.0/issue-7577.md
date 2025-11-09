---
id: 7577
title: Verify Minimum gh CLI Version Before Sync
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-20T13:22:38Z'
updatedAt: '2025-10-20T13:34:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7577'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-20T13:34:56Z'
---
# Verify Minimum gh CLI Version Before Sync

**Reported by:** @tobiu on 2025-10-20

The `SyncService` depends on specific features and output formats of the GitHub CLI (`gh`). To prevent unexpected errors, we must verify that the installed version of `gh` meets the minimum requirement defined in the configuration before attempting any synchronization operations.

## Acceptance Criteria

1.  A new private method, `#verifyGhVersion()`, is added to `SyncService.mjs`.
2.  This method executes `gh --version`, parses the output to get the semantic version number.
3.  It compares the installed version against the `aiConfig.githubWorkflow.minGhVersion` from the configuration.
4.  If the installed version is lower than the minimum requirement, the method must throw a clear, informative error that includes the current version, the required version, and instructions to upgrade.
5.  The `runFullSync()` method is updated to call `#verifyGhVersion()` at the very beginning of the process, ensuring the check runs before any other logic.

## Comments

### @tobiu - 2025-10-20 13:34

closing this one as not needed:

> ✦ You are absolutely right. That's a much more elegant and robust solution. Claude wouldn't have known about the existing
>   HealthService, but we do, and we should use it.
> 
>   Duplicating the version check logic in SyncService would be poor design. Instead, we should leverage the comprehensive checks
>   already built into HealthService.healthcheck().
> 
>   Revised Plan for Health Check
> 
>    1. Modify `mcp-stdio.mjs`:
>        * At server startup, in the main() function, we will call the HealthService.healthcheck() method.
>        * We will inspect the returned payload.
>        * If payload.status is 'unhealthy', we will log the specific errors from payload.githubCli.details and immediately terminate
>          the server process with process.exit(1).
> 
>    2. Delete the Redundant Ticket:
>        * The ticket I created, ticket-verify-gh-cli-version.md (#7577), is now redundant and incorrect. I will delete it.
> 
>   This approach is far superior because:
>    * It's DRY: We aren't repeating logic that already exists.
>    * It's Comprehensive: It checks for installation, authentication, and version, not just version.
>    * It's Fail-Fast: The server won't even finish starting if the critical gh dependency isn't met, which is the correct behavior.
>      It prevents any tool from being called in a broken state.
> 
>   I will now proceed with this revised plan.
> 
>   First, I will delete the now-obsolete ticket #7577.

