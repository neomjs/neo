---
title: Update AGENTS.md with Correct Health Check Endpoint
labels: enhancement, AI
---

GH ticket id: #7397

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket addresses a critical error in the agent's session initialization protocol as documented in `AGENTS.md`. The current instructions specify using `http://localhost:8001/health` to check the status of the memory core server. This endpoint is incorrect for the version of ChromaDB in use, resulting in a `404 Not Found` error and causing the health check to fail silently.

This silent failure has led to repeated debugging cycles in multiple sessions. The correct, functional endpoint has been identified as `http://localhost:8001/api/v2/healthcheck`. Additionally, the Swagger UI available at `http://localhost:8001/docs/` is a valuable resource for endpoint discovery and should be documented for future debugging.

This sub-task aims to:
- Correct the health check command in `AGENTS.md` to prevent future initialization failures.
- Add a note about using the `/docs` endpoint for easier debugging of the memory server API.

## Acceptance Criteria

1.  The `curl` command in `AGENTS.md` for the memory core health check is updated to use the correct `/api/v2/healthcheck` endpoint.
2.  A note is added to `AGENTS.md` mentioning the availability of the Swagger UI at the `/docs` endpoint for debugging purposes.
