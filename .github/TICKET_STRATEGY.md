# Ticket & Issue Management Strategy

This document outlines the hybrid archival strategy for managing tasks, features, and bug fixes, ensuring a clean repository, a rich and portable knowledge base, and a seamless link between local markdown tickets and the GitHub issue tracker.

This process applies to all contributors, both human and AI.

## The Process

Our workflow is designed to be simple, robust, and AI-friendly. It consists of three main phases: Creation, Association, and Archival.

### 1. Creation

- For any new task, a ticket is first created as a markdown file within the `.github/ISSUE/` directory.
- The file should be named descriptively, e.g., `ticket-enhance-helix-example.md`.
- The content of the ticket should clearly define the scope of work, acceptance criteria, and any other relevant context, acting as the primary brief for the task.

### 2. Association (Manual Step)

- After the markdown ticket is created, a corresponding issue **MUST** be created in the GitHub issue tracker.
- Immediately after creating the GitHub issue, the issue number and URL **MUST** be copied and pasted into the top of the corresponding markdown ticket file.

**Example `ticket-enhance-helix-example.md`:**

```markdown
# GitHub Issue: #1234
# https://github.com/neomjs/neo/issues/1234

# Ticket: Enhance Helix Example with Query-Driven Comments

**Assignee:** Gemini
**Status:** Done

## Description
...
```

This step is critical as it creates a permanent, version-controlled link between the detailed task description and the GitHub issue, which is essential for accurate release notes and history tracking.

### 3. Archival (Post-Release)

- The `.github/ISSUE/` directory should always reflect the work planned or completed for the **current** release cycle.
- After a new version of the framework is released, the individual ticket files for that version will be archived.
- **Archival Process:**
    1. All individual `.md` files within `.github/ISSUE/` will be concatenated into a single, version-named archive file (e.g., `v10.8.0-tickets.md`).
    2. This new archive file will be placed in the `.github/ARCHIVE/` directory.
    3. The individual ticket files will then be deleted from `.github/ISSUE/`.

This archival process ensures the repository remains lean and the working ticket directory stays clean, while preserving the full context of all completed work in a queryable, portable format for AI agents and future developers.