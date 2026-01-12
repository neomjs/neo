---
id: 8369
title: 'Refactor Features & ContentBox: Modernize Design and Content'
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-06T21:46:12Z'
updatedAt: '2026-01-06T22:17:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8369'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T22:17:07Z'
---
# Refactor Features & ContentBox: Modernize Design and Content

Modernize the `Features` section and the reusable `ContentBox` component to align with the new "Application Engine" branding and content strategy.

**Goals:**
1.  **Refactor `ContentBox.mjs`:** Update the component to use modern VDOM structure (semantic HTML), clean semantic styling variables (removing legacy hex codes), and ensure it serves as the "source of truth" for feature cards.
2.  **Update `Features.mjs` Content:** Replace the outdated feature list with the 6 core "Engine Subsystems" defined in the README (OMT, Scene Graph, JSON Blueprints, State Provider, Multi-Window, Zero-Build).
3.  **Visual Consistency:** Ensure `ContentBox` styling matches the aesthetic established in `AiToolchain` (clean borders, neutral backgrounds, GT-Planar font).
4.  **Refactor `AiToolchain.mjs`:** Update it to utilize the improved `ContentBox` component instead of manual VDOM, enforcing consistency across the page.

**Files:**
- `apps/portal/view/home/ContentBox.mjs` & `.scss`
- `apps/portal/view/home/parts/Features.mjs`
- `apps/portal/view/home/parts/AiToolchain.mjs`
- `resources/scss/src/apps/portal/home/parts/Features.scss`

## Timeline

- 2026-01-06T21:46:14Z @tobiu added the `enhancement` label
- 2026-01-06T21:46:14Z @tobiu added the `design` label
- 2026-01-06T21:46:15Z @tobiu added the `ai` label
- 2026-01-06T21:47:19Z @tobiu assigned to @tobiu
- 2026-01-06T22:17:08Z @tobiu closed this issue
### @tobiu - 2026-01-06T22:17:42Z

**Input from Gemini 3 Pro:**

> ✦ **Scope Update & Implementation Report**
> 
> The scope of this ticket was expanded during implementation to ensure a cohesive result across the homepage.
> 
> **Completed Actions:**
> 1.  **ContentBox Refactoring:** Converted to a clean VDOM-based component with semantic styling, serving as the shared foundation for both "Features" and "AI Toolchain" sections.
> 2.  **Features Section:** Updated to match the "6 Engine Subsystems" defined in the README.
> 3.  **AI Toolchain Refinement:** 
>     *   Refactored to use the new `ContentBox`.
>     *   **Scope Extension:** Significantly expanded the card content to include detailed, technically accurate bullet points (e.g., "Code Execution Patterns", "Live Runtime Mutation") based on the latest architectural discussions.
> 4.  **Layout Polish:** Fixed grid alignment issues and hover-state clipping by refining the SCSS for both sections.
> 
> This establishes a consistent "Feature Card" language across the Portal.

- 2026-01-06T22:58:19Z @tobiu referenced in commit `9d6e406` - "Refactor Features & ContentBox: Modernize Design and Content #8369"
- 2026-01-07T13:25:09Z @jonnyamsp referenced in commit `98a1f48` - "feat(portal): Modernize Feature Cards & AI Toolchain (resolves #8369)

- Refactor  to use semantic VDOM and modern styling (GT-Planar, neutral bg).
- Update  section with the 6 core Engine Subsystems from the README.
- Polish  layout and content to highlight Neural Link and Code Execution patterns.
- Ensure consistent grid layouts and vertical rhythm across the homepage."

