---
id: 8642
title: Adaptive Wave Geometry for Social Icons
state: CLOSED
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T17:27:00Z'
updatedAt: '2026-01-14T17:29:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8642'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T17:29:27Z'
---
# Adaptive Wave Geometry for Social Icons

Implement adaptive wave geometry in the Header Canvas to treat Social Icons differently from Text Buttons.

**Logic:**
1.  **Detection:** Identify "Icon Buttons" by checking the aspect ratio of the `navRect`. If `width` is close to `height` (e.g., within 20%), treat it as an Icon/Circle.
2.  **Adaptive Geometry:**
    - **Text Buttons (Rectangles):** Keep the existing wide, smooth cosine envelope.
    - **Icon Buttons (Circles):** Use a tighter, steeper envelope (e.g., `Math.pow` or sharper Sigmoid) that hugs the circular shape closely.
3.  **Visual Result:** The energy stream should flow loosely around main navigation but "tighten" into an orbit-like shape around the social icons.


## Timeline

- 2026-01-14T17:27:01Z @tobiu added the `enhancement` label
- 2026-01-14T17:27:01Z @tobiu added the `design` label
- 2026-01-14T17:27:01Z @tobiu added the `ai` label
- 2026-01-14T17:28:30Z @tobiu referenced in commit `6c25d20` - "feat: implement adaptive wave geometry for social icons (#8642)"
- 2026-01-14T17:28:51Z @tobiu assigned to @tobiu
- 2026-01-14T17:28:59Z @tobiu added parent issue #8630
### @tobiu - 2026-01-14T17:29:01Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the adaptive wave geometry:
> - **Detection:** Buttons with an aspect ratio < 1.5 are identified as "Icons" (Socials).
> - **Adaptive Envelope:**
>   - **Icons:** Use a sharper, cubic envelope (`Math.pow(..., 3)`) to tightly hug the circular shape.
>   - **Text Buttons:** Use the standard cosine envelope for a wider, smoother flow.
> - **Result:** The wave now differentiates between content navigation and community icons, creating a distinct "Tight Orbit" effect for the latter.

- 2026-01-14T17:29:28Z @tobiu closed this issue

