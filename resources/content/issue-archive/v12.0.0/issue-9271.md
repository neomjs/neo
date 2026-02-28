---
id: 9271
title: 'Create DevIndex Guide: The Ethical Manifesto (Why We Built This)'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-23T17:13:43Z'
updatedAt: '2026-02-23T18:33:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9271'
author: tobiu
commentsCount: 2
parentIssue: 9267
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-23T18:33:51Z'
---
# Create DevIndex Guide: The Ethical Manifesto (Why We Built This)

**Objective:** Address the "ripping data" concern head-on by clearly stating the project's ethical foundation and mission.
**Key Points:**
- Define the "Invisibility Problem" in open-source.
- Address the attribution failure of modern LLMs that ingest FOSS data without giving credit back to the developers.
- Explain why enforcing a strict, 50,000-user meritocracy is vital for the sustainability of open-source.
- Reiterate that DevIndex is a non-commercial, tracking-free, ad-free project with a strict Opt-Out-first privacy policy.

## Timeline

- 2026-02-23T17:13:45Z @tobiu added the `documentation` label
- 2026-02-23T17:13:45Z @tobiu added the `enhancement` label
- 2026-02-23T17:13:45Z @tobiu added the `ai` label
- 2026-02-23T17:14:16Z @tobiu added parent issue #9267
- 2026-02-23T17:14:32Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-23T17:19:12Z

**Input from Gemini 3.1 Pro:**

> ✦ **Note for future agent session:** 
> Before starting work on this guide, you **MUST** read the following existing documentation as critical context:
> - `learn/guides/devindex/Introduction.md` (For the framing of the LLM attribution failure and the Invisibility Problem)
> - `learn/guides/devindex/OptOut.md` & `learn/guides/devindex/OptIn.md` (To provide technical, cryptographic proof that we enforce the privacy and meritocracy we preach)

- 2026-02-23T18:32:48Z @tobiu referenced in commit `3ae9e10` - "docs: Create The Ethical Manifesto guide (#9271)"
### @tobiu - 2026-02-23T18:33:29Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed and committed `The Ethical Manifesto (Why We Built This)`.
> 
> Key details:
> - Placed the guide as a top-level node in `tree.json` (right after Introduction & Overview) as requested, because its scope is foundational to the entire project rather than being a specific "Persona Guide".
> - Updated the content to specifically use the term "Data Factory" instead of "backend", aligning with the established project narrative.
> - Addressed the core points: The Invisibility Problem, the LLM attribution failure, the strict necessity of the 50,000-user Meritocracy Filter, and the cryptographic proof behind our Opt-Out-First privacy policy.
> 
> Closing this ticket as the work is merged into `dev`.

- 2026-02-23T18:33:51Z @tobiu closed this issue

