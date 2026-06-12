---
id: 4818
title: 'form.field.Checkbox, form.field.Text: Fire userChange event'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-09-01T14:33:47Z'
updatedAt: '2023-12-05T12:12:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4818'
author: pensuwan-k
commentsCount: 12
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-05T12:12:09Z'
---
# form.field.Checkbox, form.field.Text: Fire userChange event

It would be good to make a distinction between change events that are triggered programmatically or by user input

## Timeline

- 2023-09-01T14:33:47Z @pensuwan-k added the `enhancement` label
### @Ghost - 2023-09-01T14:39:01Z


@tobiu  I tried to implement `userchange` event in Checkbox component's `onInputValueChange` method:

https://github.com/neomjs/neo/blob/8533de4ad4f96cda296b28858db3a54cbe0b7e96/src/form/field/CheckBox.mjs#L493-L501

But this method also gets triggered when the checkbox value is changed programmatically (e.g. bind). Is there any other way to differentiate user triggered change?

- 2023-09-01T14:40:36Z @Ghost assigned to @tobiu
### @tobiu - 2023-09-01T17:41:54Z

you are right: a programmatic change will trigger `onInputValueChange ()` too, since it will update the DOM afterwards.

however: inside the method => if `checked === me.checked` it should be a programmatic change (since the value already updated before the DOM change) and vise versa. just thinking out loud, needs some testing :)

### @Ghost - 2023-09-04T09:56:40Z

Just tested the solution:

https://github.com/dztoprak/neo/blob/de72ed5b0a4aa39c0ec06f5b8358fbb0dd564915/src/form/field/CheckBox.mjs#L493-L505

`checked` has always the opposite value of `me.checked`, so the condition is never true.

### @shrutiambekar - 2023-09-04T11:53:06Z

@ThorstenRaab  

### @tobiu - 2023-09-10T21:24:23Z

<img width="808" alt="Screenshot 2023-09-10 at 23 22 29" src="https://github.com/neomjs/neo/assets/1177434/804ffc42-ab9e-4c25-bb47-2e0ab7a127dc">

@dztoprak: just did a quick test. the first 2 changes happened when clicking on the field. opposite value for this one.

when programmatically changing the checked state, `onInputValueChange()` does not trigger at all for me. so we could just always fire a custom event in there. needs testing :)

### @tobiu - 2023-09-10T21:28:22Z

looks the same way for TextFields:
<img width="1302" alt="Screenshot 2023-09-10 at 23 30 50" src="https://github.com/neomjs/neo/assets/1177434/88a9518b-1a06-4dbe-8d6d-460e82efaed5">

### @Ghost - 2023-09-14T12:42:29Z

For me, the `onInputValueChange` is triggered by all programmatic changes in checkboxes. I haven't tried with the text fields though:


https://github.com/neomjs/neo/assets/126246513/902d9a2b-dd98-41f0-a8fa-a5ebedadf3c7



### @tobiu - 2023-09-14T13:01:48Z

careful deniz: IF you are clicking on one checkbox to change the checked state of a different one, you will get onInputValueChanged() for the one you clicked on :)

try what i did => control + right click on a checkbox. store it inside a global var. then change the checked state inside the dev tools.

### @Ghost - 2023-09-14T13:43:20Z

good point, checkbox controllers are not exempt from the checkbox logic of course 😄 

### @Ghost - 2023-09-14T14:44:40Z

@tobiu do you know how can I access the `oldValue` in Text's `onInputValueChange` method? 

### @tobiu - 2023-09-14T14:46:33Z

sure. before setting this.value, you can access `this.value` or `this._value` to get the old value :)

- 2023-09-14T15:14:09Z @Ghost cross-referenced by PR #4905
- 2023-09-14T18:31:13Z @tobiu referenced in commit `a12038c` - "form.field.Checkbox, form.field.Text: Fire userChange event #4818"
- 2023-09-14T18:41:44Z @tobiu referenced in commit `18da892` - "v6.5.3 (#4906)

* dependencies update

* util.Function: debounce() => doc comments update

* form.field.Checkbox, form.field.Text: Fire userChange event #4818

* Form.view.FormContainerController: cleanup

* v6.5.3"
### @tobiu - 2023-12-05T12:12:09Z

resolved already.

- 2023-12-05T12:12:09Z @tobiu closed this issue

