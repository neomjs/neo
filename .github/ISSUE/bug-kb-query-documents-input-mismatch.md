---
title: "Bug: query_documents input parameter mismatch"
labels: bug, AI
---

Parent epic: #7501
GH ticket id: #7516

**Phase:** 4 (Bugfix)
**Assignee:** tobiu
**Status:** Done

## Description

When calling the `query_documents` tool, the MCP client receives an error: `params must NOT have additional properties`. Additionally, the `queryDocuments` service function reports that "A query string must be provided," indicating that the `query` parameter is not being correctly passed.

This bug prevents the `query_documents` tool from functioning correctly, as its input parameters are not being validated or routed as expected.

## Acceptance Criteria

1.  The `openapi.yaml` definition for the `query_documents` tool is reviewed and corrected.
2.  The `buildZodSchema` function in `toolService.mjs` is reviewed to ensure it correctly processes `requestBody` parameters for direct argument mapping.
3.  The `query` and `type` parameters are correctly passed from the MCP client to the `queryDocuments` service function.
4.  The `query_documents` tool executes successfully with valid parameters.
