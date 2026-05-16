---
id: 3998
title: 'button.Base: UI variations'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-02-06T15:59:29Z'
updatedAt: '2023-02-06T21:49:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3998'
author: mxmrtns
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-06T21:49:34Z'
---
# button.Base: UI variations

Following up on #3996 

In order to cater for different UI needs, I suggest splitting up the CSS variables for buttons into 'Base'(values that should be the same across all different button types) and 'UI Variants' like Primary or Secondary.

### Base
- border-radius
- font-family
- font-size
- button-outline-focus
- [...] anything that should stay the same across the different UI button types
### Primary
- button-secondary-background-color
- button-secondary-text-color
- button-secondary-border-color
- [...] anything that should be changeable for each UI variation
##### :hover
- button-secondary-background-color-hover
- button-secondary-text-color-hover
- button-secondary-border-colour-hover
##### :active
- button-secondary-background-color-active
- button-secondary-text-color-active
- button-secondary-border-color-active
##### Disabled
- button-secondary-background-color-disabled
- button-secondary-text-color-active-disabled
- button-secondary-border-color-active-disabled

--- 

The same variable structure would be needed for the following UI button types:

- Secondary
- Tertiary
- Ghost

## Timeline

- 2023-02-06T15:59:29Z @mxmrtns added the `enhancement` label
- 2023-02-06T19:15:06Z @tobiu referenced in commit `db156ed` - "#3998 border-color for secondary & tertiary uis"
- 2023-02-06T19:30:06Z @tobiu referenced in commit `dff2b5c` - "#3998 renamed active button styles to better follow our naming convention"
- 2023-02-06T19:51:37Z @tobiu referenced in commit `6adc883` - "#3998 active background-color, border-color & text color for secondary & tertiary uis"
- 2023-02-06T19:59:41Z @tobiu referenced in commit `21850f4` - "#3998 glyph-color-active for primary, secondary & tertiary uis"
- 2023-02-06T20:06:37Z @tobiu referenced in commit `2ba64fe` - "#3998 background-color-hover for secondary & tertiary uis"
- 2023-02-06T20:09:18Z @tobiu referenced in commit `e16a4fb` - "#3998 refactoring: button-hover-background-color => button-background-color-hover"
- 2023-02-06T20:12:00Z @tobiu referenced in commit `32b159a` - "#3998 refactoring: button-hover-border-color => button-border-color-hover"
- 2023-02-06T20:12:55Z @tobiu referenced in commit `6e9c89f` - "#3998 refactoring: button-hover-border-color => button-border-color-hover"
- 2023-02-06T20:18:05Z @tobiu referenced in commit `13b3850` - "#3998 refactoring: button-hover-color => button-text-color-hover"
- 2023-02-06T20:23:28Z @tobiu referenced in commit `4d9869a` - "#3998 border-color-hover for secondary & tertiary uis"
- 2023-02-06T20:29:46Z @tobiu referenced in commit `907e957` - "#3998 glyph-color-hover for primar, secondary & tertiary uis"
- 2023-02-06T20:43:52Z @tobiu referenced in commit `72ac702` - "#3998 text-color-hover secondary & tertiary uis, adjusted the src file"
- 2023-02-06T20:58:49Z @tobiu referenced in commit `ef0f5f6` - "#3998 background-color-disabled for secondary & tertiary uis"
- 2023-02-06T21:02:41Z @tobiu referenced in commit `8f13e26` - "#3998 border-color-disabled for secondary & tertiary uis"
- 2023-02-06T21:09:25Z @tobiu referenced in commit `be5c187` - "#3998 glyph-color-disabled for secondary & tertiary uis"
- 2023-02-06T21:15:17Z @tobiu referenced in commit `577a1f6` - "#3998 text-color-disabled for secondary & tertiary uis"
- 2023-02-06T21:21:05Z @tobiu referenced in commit `ffcfe41` - "#3998 opacity-disabled for secondary & tertiary uis"
- 2023-02-06T21:26:05Z @tobiu referenced in commit `2834e07` - "#3998 button.Base: scss src => refactored the items order"
- 2023-02-06T21:33:01Z @tobiu referenced in commit `ee6d12e` - "#3998 ripple-background-color for secondary & tertiary uis"
### @tobiu - 2023-02-06T21:49:34Z

Hi Max,

this took quite a while. Let us create a follow up ticket for the ghost ui.

we most likely also need `pressed` states for our different button uis:
https://m2.material.io/design/interaction/states.html#usage

also a follow up ticket if needed. Let's do a quick call tomorrow.

- 2023-02-06T21:49:34Z @tobiu closed this issue

