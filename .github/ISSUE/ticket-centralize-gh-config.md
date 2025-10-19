---
title: "Centralize GitHub Workflow Configuration"
labels: enhancement, AI
---

GH ticket id: #7560

**Epic:** #7536
**Phase:** 3
**Assignee:** tobiu
**Status:** Done

## Description

The `HealthService` for the `github-workflow` server currently has the minimum required GitHub CLI version hardcoded as a constant. This should be moved into the shared `ai/mcp/server/config.mjs` file to centralize configuration and make it easier to manage.

## Acceptance Criteria

1.  A new `githubWorkflow` object is added to the `aiConfig` in `ai/mcp/server/config.mjs`.
2.  This new object contains a `minGhVersion` property with the value `'2.0.0'`.
3.  The `HealthService.mjs` is updated to import the `aiConfig` and use `aiConfig.githubWorkflow.minGhVersion` instead of the hardcoded `MIN_GH_VERSION` constant.
4.  The `healthcheck` tool continues to function correctly.
