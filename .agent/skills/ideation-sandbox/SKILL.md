---
name: ideation-sandbox
description: Safely propose architectural features, unknown unknowns, and brainstorm ideas natively in GitHub Discussions.
triggers: Use this skill when the user asks to brainstorm an architecture change or proposes a highly exploratory / undefined technical idea.
---

# Ideation Sandbox

## Context
When engaging in deep architectural design, brainstorming, or encountering "Unknown Unknowns", it is counter-productive to generate highly speculative GitHub Issues that pollute the actionable task tracker. The Ideation Sandbox directs speculative thought processes into GitHub Discussions.

## Triggers
You **MUST** use this skill when:
- Brainstorming a new, complex feature that lacks formal requirements.
- Exploring major architectural refactors.
- Discussing concepts that are not yet actionable.

## Instructions
1. **Never create an Issue for ideation.** If your intent is speculative or exploratory, abort Issue creation immediately.
2. **Use Discussions.** Call the `create_discussion` tool to post your proposal.
3. **Set the Category.** Map the discussion to the `Ideas` category.
4. **Format the Proposal.** The body of the discussion should clearly articulate:
   - **The Concept:** What is being proposed?
   - **The Rationale:** Why is this valuable?
   - **Open Questions:** What unknowns still need to be addressed?
5. **Graduation:** If the user and team decide an idea is ready for implementation, *then* a formal GitHub issue can be raised referencing the discussion.
