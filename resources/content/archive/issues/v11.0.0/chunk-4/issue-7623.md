---
id: 7623
title: Enhance GitHub Workflow OpenAPI Spec with Rich Descriptions
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-10-23T14:18:22Z'
updatedAt: '2025-10-23T14:31:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7623'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-23T14:31:59Z'
---
# Enhance GitHub Workflow OpenAPI Spec with Rich Descriptions

The current `ai/mcp/server/github-workflow/openapi.yaml` file is functional but lacks the rich, descriptive documentation needed for an AI agent to effectively and safely use the tools. The descriptions for each operation are minimal and do not provide sufficient context, examples, or strategic guidance.

In contrast, the `ai/mcp/server/knowledge-base/openapi.yaml` provides an excellent template for what is required, with detailed explanations, `When to Use` sections, and examples.

### Task

Thoroughly review and update the `description` for every operation in `ai/mcp/server/github-workflow/openapi.yaml` to provide the same level of detail and clarity as the knowledge-base API.

**Key Improvements to Make:**

1.  **Detailed Explanations:** For each tool, explain what it does, its parameters, and what it returns in detail.
2.  **Strategic Guidance:** Add `When to Use` sections where appropriate to guide the AI on the correct workflow. For example, for `create_issue`, explicitly state that it is the first step and should be followed by `sync_all`.
3.  **Workflow Rules & Constraints:** Add critical instructions. For instance, the `create_issue` description must state that the `labels` parameter must only contain existing repository labels and that the `list_labels` tool should be used first if there is any uncertainty.
4.  **Examples:** Add `example` values for parameters and `examples` for request bodies where it would clarify usage.
5.  **Review All Operations:** This task covers all operations in the file, including `healthcheck`, `list_labels`, `list_pull_requests`, `checkout_pull_request`, `get_pull_request_diff`, `create_comment`, `get_conversation`, `add_labels`, `remove_labels`, `get_local_issue_by_id`, `create_issue`, and `sync_all`.

### Acceptance Criteria

-   Every operation in `github-workflow/openapi.yaml` has a multi-line `description` that clearly explains its purpose and usage.
-   Critical workflow instructions and constraints are embedded in the descriptions.
-   The overall quality of the documentation is on par with `knowledge-base/openapi.yaml`.

## Timeline

- 2025-10-23T14:18:22Z @tobiu assigned to @tobiu
- 2025-10-23T14:18:23Z @tobiu added the `documentation` label
- 2025-10-23T14:18:23Z @tobiu added the `ai` label
- 2025-10-23T14:31:52Z @tobiu referenced in commit `bf938c3` - "Enhance GitHub Workflow OpenAPI Spec with Rich Descriptions #7623"
- 2025-10-23T14:31:59Z @tobiu closed this issue

