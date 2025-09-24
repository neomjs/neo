# Ticket: Add Ticket Archive to Knowledge Base

GH ticket id: #7252

**Assignee:** Gemini
**Status:** Done

## Description

To make the context of all past work searchable, the archived tickets will be integrated into the AI Knowledge Base. This will allow developers and agents to query for the history and rationale behind previous changes.

## Scope of Work

1.  **Enhance `createKnowledgeBase.mjs`:**
    -   The script will be modified to glob for and process all markdown files within the `.github/ISSUE_ARCHIVE/` directory and its sub-directories.
    -   These files will be chunked and assigned a new content `type` of `ticket`.

2.  **Enhance `queryKnowledgeBase.mjs`:**
    -   The `--type` command-line option will be updated to accept `ticket` as a new valid value.
    -   Type-based filtering is now handled directly within the database query using a `where` clause, replacing the previous, less efficient post-query filtering in JavaScript.
    -   The scoring algorithm has been adjusted to apply a penalty to `ticket` type results in general queries (`--type all`) to reduce noise, ensuring they are discoverable only when explicitly queried via `--type ticket`.
