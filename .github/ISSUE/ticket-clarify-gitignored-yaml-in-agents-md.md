# Ticket: Clarify git-ignored class-hierarchy.yaml in AGENTS.md

GH ticket id: #3707

**Assignee:** Gemini
**Status:** Done

## Description
Add a clear note to AGENTS.md, specifically in the "Read the Codebase Structure" section, indicating that `docs/output/class-hierarchy.yaml` is a git-ignored file. This will prevent confusion and frequent session failures when AI agents attempt to open it without realizing it might not be present in a fresh clone or after a clean operation.

## Acceptance Criteria
- The `AGENTS.md` file is updated.
- The update includes a clear statement about `docs/output/class-hierarchy.yaml` being git-ignored.
- The statement is located in the section describing the reading of `class-hierarchy.yaml`.
- The wording is concise and unambiguous.
