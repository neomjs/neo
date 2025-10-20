---
title: "Implement Missing #checkGhAuth Method in HealthService"
labels: bug, AI
---

GH ticket id: #7585

**Epic:** #7564
**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

A code review revealed that the `HealthService.healthcheck` method calls a private method, `#checkGhAuth()`, which does not exist in the file. This is a critical bug that causes the health check to fail and prevents the server from starting.

This ticket covers the implementation of the missing authentication check.

## Acceptance Criteria

1.  A new private method, `#checkGhAuth()`, is implemented in `HealthService.mjs`.
2.  The method executes the `gh auth status` command.
3.  It correctly parses the output of the command to determine if the user is authenticated with `github.com`.
4.  It returns an object with the shape `{ authenticated: boolean, error?: string }`.
    - `authenticated` should be `true` if login is successful, `false` otherwise.
    - `error` should contain an informative message if authentication fails.
