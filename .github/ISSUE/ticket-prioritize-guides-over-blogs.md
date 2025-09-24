# Ticket: Prioritize Guides Over Blogs in AI Queries

GH ticket id: #7243

**Assignee:** Gemini
**Status:** Done

## Description

To mitigate the risk of the AI using outdated information from historical blog posts, a new content-type priority system will be implemented. This ensures that evergreen content (guides, source code) is always favored over time-stamped blog posts for technical and implementation-related queries.

This change follows the "Content-Type Priority" approach brainstormed to improve the long-term integrity of the knowledge base.

## Scope of Work

1.  **Update `queryKnowledgeBase.mjs` Scoring:**
    -   Modify the scoring algorithm to significantly increase the score for `guide` chunks compared to `blog` chunks. This will ensure that for a given keyword match, a guide will always be ranked higher than a blog post.

2.  **Update `AGENTS.md` Protocol:**
    -   Add a new instruction to the "How to Interpret Query Results" section.
    -   This instruction will explicitly state that the agent must prioritize `guide` and `src` results for implementation details, and should treat `blog` posts as sources for historical and conceptual context only.

3.  **Establish New Convention:**
    -   This ticket formalizes a new, forward-looking convention: all future blog posts should ideally include a version number in their filename or front matter (e.g., `v10.9-My-Feature.md`) to provide clear temporal context.

## Acceptance Criteria

-   A general query that matches keywords in both a guide and a blog post ranks the guide significantly higher.
-   `AGENTS.md` contains the new directive for prioritizing query results.
-   The new convention for versioning blog posts is documented.
