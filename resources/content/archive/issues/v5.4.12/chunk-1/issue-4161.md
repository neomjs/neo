---
id: 4161
title: 'form.field.Checkbox: Required validation needed'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-03-02T10:43:26Z'
updatedAt: '2023-04-24T16:58:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4161'
author: alberthashani
commentsCount: 6
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-04-24T16:58:55Z'
---
# form.field.Checkbox: Required validation needed

*(No description provided)*

## Timeline

- 2023-03-02T10:43:26Z @alberthashani added the `enhancement` label
### @tobiu - 2023-03-02T11:40:21Z

some thoughts: we could pretty easily add a `required_` config, as well as a `validate()` & `isValid()` method. these methods could add a `neo-invalid` css rule and we could e.g. add a red color.

adding an error message (label) would be a follow up ticket which requires more work => we would need to adjust the vdom structure to support it.

### @alberthashani - 2023-03-02T14:43:25Z

Nice, I think we would need the custom error message right away, so shall i include/define that in the description of this feature request or is it nessecary from your point of view to have them in sperate feature requests?

### @tobiu - 2023-03-02T14:45:36Z

i would go for 2 tickets to keep the scope of each smaller :) a checkbox with a red background would be pretty obvious to be required i guess, but you never know.

### @alberthashani - 2023-03-02T15:50:12Z

Ok I’m with you, i will create another ticket for custom error messages as soon as this is closed.

- 2023-04-24T11:32:07Z @tobiu referenced in commit `0b48de5` - "#4161 form.field.Checkbox: adjusted the DOM markup to support error messages"
- 2023-04-24T11:36:11Z @tobiu referenced in commit `c2f36a7` - "#4161 form.field.Checkbox: error div styling"
- 2023-04-24T12:36:49Z @tobiu referenced in commit `f788fa6` - "#4161 examples.form.field.checkbox.MainContainer: error TextField"
- 2023-04-24T12:42:30Z @tobiu referenced in commit `a755d94` - "#4161 form.field.CheckBox: required_"
- 2023-04-24T12:43:08Z @tobiu referenced in commit `6ac955a` - "#4161 form.field.CheckBox: error_"
- 2023-04-24T12:46:51Z @tobiu referenced in commit `93e309e` - "#4161 form.field.CheckBox: afterSetError()"
### @tobiu - 2023-04-24T12:47:19Z

work in progress:
<img width="1153" alt="Screenshot 2023-04-24 at 14 46 29" src="https://user-images.githubusercontent.com/1177434/234000377-dd339ead-6a75-4339-9fb5-16994c7f5240.png">

@alberthashani @deniztoprak 

- 2023-04-24T14:14:15Z @tobiu referenced in commit `8b6d0a2` - "#4161 form.field.CheckBox: afterSetError() => neo-invalid css rule"
- 2023-04-24T14:24:27Z @tobiu referenced in commit `2a76c7f` - "#4161 form.field.CheckBox: .neo-invalid styling"
- 2023-04-24T14:27:50Z @tobiu referenced in commit `741ee8a` - "#4161 form.field.CheckBox: isValid()"
- 2023-04-24T14:34:46Z @tobiu referenced in commit `12028dd` - "#4161 form.field.CheckBox: validate()"
- 2023-04-24T14:36:05Z @tobiu referenced in commit `22b4384` - "#4161 form.field.CheckBox: validate() => resetting the error config if needed"
- 2023-04-24T14:38:59Z @tobiu referenced in commit `60ef60a` - "#4161 form.field.CheckBox: afterSetChecked() => triggering validate()"
- 2023-04-24T14:43:32Z @tobiu referenced in commit `971cd98` - "#4161 form.field.CheckBox: afterSetRequired()"
- 2023-04-24T14:44:47Z @tobiu referenced in commit `3c807b7` - "#4161 form.field.CheckBox: clean class field"
- 2023-04-24T16:25:09Z @tobiu referenced in commit `a44b7bb` - "#4161 form.field.CheckBox: updateError()"
- 2023-04-24T16:30:36Z @tobiu referenced in commit `aaf756b` - "#4161 form.field.CheckBox: removed the auto-generated import"
- 2023-04-24T16:32:31Z @tobiu referenced in commit `ca89207` - "#4161 form.field.CheckBox: afterSetRequired() => smarter check"
- 2023-04-24T16:35:31Z @tobiu referenced in commit `9bac8e2` - "#4161 form.field.CheckBox: validate() => smarter logic"
- 2023-04-24T16:37:05Z @tobiu referenced in commit `98f1da4` - "#4161 form.field.CheckBox: validate() => else logic, superclass call"
- 2023-04-24T16:43:37Z @tobiu referenced in commit `49675e5` - "#4161 form.field.CheckBox: validate() => getting the logic closer to TextFields"
- 2023-04-24T16:53:37Z @tobiu referenced in commit `027defc` - "#4161 form.field.CheckBox: validate() => removing the clean state if needed"
- 2023-04-24T16:56:40Z @tobiu referenced in commit `ba4f3fe` - "#4161 form.field.CheckBox: cleanup"
### @tobiu - 2023-04-24T16:58:55Z

done now. let us create a new ticket for `groupRequired` or similar (check 1+ items out of many)

- 2023-04-24T16:58:55Z @tobiu closed this issue

