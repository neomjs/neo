---
id: 7760
title: Implement `llms.txt` specification and differentiate from `llm.txt`
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-12T15:09:51Z'
updatedAt: '2025-11-13T12:49:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7760'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-13T12:49:31Z'
---
# Implement `llms.txt` specification and differentiate from `llm.txt`

The current `llm.txt` file in `@apps/portal/llm.txt` is intended to provide information for Large Language Models (LLMs) but is currently just a list of URLs. This does not conform to the emerging `llms.txt` specification https://llmstxt.org/, which defines a structured Markdown file for LLM content indexing.

This ticket aims to correctly implement the `llms.txt` specification for the Neo.mjs website and clarify its purpose in relation to a potential `llm.txt` for crawler permissions.

**Acceptance Criteria:**
1.  **Rename/Refactor `llm.txt` to `llms.txt`**: The existing `llm.txt` in `@apps/portal/llm.txt` should be replaced or transformed into a new `llms.txt` file that adheres to the `https://llmstxt.org/` specification.
2.  **Update `generateSeoFiles.mjs`**: The `buildScripts/generateSeoFiles.mjs` script must be modified to generate the new `llms.txt` file.
3.  **`llms.txt` Content Structure**: The generated `llms.txt` must:
    *   Be a Markdown document.
    *   Include a mandatory H1 header for the project/site name (e.g., `# Neo.mjs Platform`).
    *   Contain an optional blockquote for a concise summary of the website.
    *   Feature additional Markdown sections for detailed information.
    *   Include H2-delimited "file lists" with URLs pointing to more detailed Markdown versions of relevant pages (e.g., key guides, API documentation).
4.  **Content Generation Strategy**: Define and implement a strategy for populating the `llms.txt` content. This could involve:
    *   Automatically extracting summaries from existing Markdown files.
    *   Allowing for manual curation of key summaries and links.
    *   Leveraging the `learn/tree.json` structure to identify important content.
5.  **Differentiation**: Clarify the role of `llm.txt` (for crawler permissions) versus `llms.txt` (for content indexing). If a separate `llm.txt` for permissions is deemed necessary and distinct from `robots.txt`, a plan for its generation should be included. For now, the primary focus is on `llms.txt`.

## Timeline

- 2025-11-12T15:09:52Z @tobiu added the `documentation` label
- 2025-11-12T15:09:53Z @tobiu added the `enhancement` label
- 2025-11-12T15:09:53Z @tobiu added the `ai` label
- 2025-11-13T12:11:45Z @tobiu assigned to @tobiu
- 2025-11-13T12:49:18Z @tobiu referenced in commit `689e9d2` - "Implement llms.txt specification and differentiate from llm.txt #7760"
- 2025-11-13T12:49:31Z @tobiu closed this issue

