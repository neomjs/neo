---
title: "Implement GraphQL Client & Auth Service"
labels: enhancement, AI
---

GH ticket id: #7591

**Epic:** #7590
**Assignee:** tobiu
**Status:** To Do

## Description

This ticket covers the foundational work for migrating to a direct GraphQL API implementation. It involves creating a centralized, reusable service for making GraphQL calls to the GitHub API.

## Acceptance Criteria

1.  The `node-fetch` library (or a similar lightweight HTTP client) is added as a dependency to the `package.json` for the MCP server.
2.  A new singleton service, `GraphqlService.mjs`, is created.
3.  The service includes a method to get the GitHub auth token via `gh auth token` and cache it for subsequent requests.
4.  The service exposes a generic `query()` or `request()` method that handles:
    -   Sending the GraphQL query/mutation to the GitHub API endpoint.
    -   Attaching the necessary `Authorization` and `Content-Type` headers.
    -   Basic error handling for network requests and GraphQL API errors.
