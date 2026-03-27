---
id: 9379
title: 'Mobile Scrollbar UX: Increase touch width to 40px and theme thumb colors'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-07T17:56:58Z'
updatedAt: '2026-03-07T18:09:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9379'
author: tobiu
commentsCount: 1
parentIssue: 9369
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-07T18:09:11Z'
---
# Mobile Scrollbar UX: Increase touch width to 40px and theme thumb colors

*Follow-up to Epic #9369*

In resolving the invisible WebKit scrollbar thumb on mobile (#9376), we had to explicitly define `::-webkit-scrollbar-thumb` styling. Currently, the `background-color` is hardcoded to a neutral grey. Additionally, the touch target width (`24px`) is too small for comfortable grabbing according to mobile HIG standards.

**Tasks:**
1. Extract the hardcoded thumb color into theme-specific CSS variables (`--grid-scrollbar-thumb-color`).
2. Increase the `--grid-scrollbar-touch-width` from `24px` to `40px` to provide a massive, reliable touch hitbox for the "scrub bar" interaction.
3. Update the thumb's transparent border to `8px` so the visual thumb remains sleek (`24px` visual width) inside the massive `40px` invisible container.

## Timeline

- 2026-03-07T17:56:59Z @tobiu added the `enhancement` label
- 2026-03-07T17:56:59Z @tobiu added the `ai` label
- 2026-03-07T17:57:08Z @tobiu added parent issue #9369
- 2026-03-07T18:07:43Z @tobiu assigned to @tobiu
- 2026-03-07T18:08:05Z @tobiu referenced in commit `5874338` - "feat(Grid): enhance mobile scrollbar UX with 40px touch targets and themed colors (#9379)"
### @tobiu - 2026-03-07T18:08:52Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed the UX upgrades for the mobile scrollbar!
> 
> 1.  **Massive Touch Target:** The `body.neo-has-touch` environment now expands the vertical scrollbar container and the `::-webkit-scrollbar` width to `40px` (via `--grid-scrollbar-touch-width`). This aligns with mobile accessibility guidelines for touch targets.
> 2.  **Sleek Visuals:** To prevent the thumb from looking comically huge inside a 40px track, I added an `8px` transparent border (`background-clip: padding-box`). The visual thumb is a sleek `24px` wide, but the invisible touchable area remains `40px`.
> 3.  **Themed Colors:** The hardcoded grey fallback is gone. All 5 themes now provide a `--grid-scrollbar-thumb-color` that matches their respective dark/light palettes (e.g., translucent white for `neo-dark`).
> 4.  **WebKit Bug Fix:** The inner spacer div is explicitly set to `10px`. This tricks the mobile WebKit emulator into recognizing enough content width to paint the thumb, but avoids hitting the right-edge boundary that triggers the "corner intersection artifact".
> 
> **A note on Thumb Height:**
> In the Chrome DevTools mobile emulator, the thumb height might still appear incredibly small (or invisible) when viewing 50,000 rows. This is because WebKit calculates native thumb height based on the `containerHeight / contentHeight` ratio, and the emulator often fails to enforce a reasonable minimum height. 
> Real iOS/Android devices have robust OS-level minimum thumb sizes for accessibility. We will test these changes on physical hardware to confirm if the OS-level minimum height kicks in as expected. If not, a pure DOM-based custom "Scrub Bar" component might be the final evolution for massive datasets.
> 
> Closing this ticket!

- 2026-03-07T18:09:11Z @tobiu closed this issue

