---
id: 4869
title: 'examples.form.field.select.MainContainer: width control'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-09-10T20:52:15Z'
updatedAt: '2023-09-10T20:53:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4869'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-10T20:53:45Z'
---
# examples.form.field.select.MainContainer: width control

<img width="1253" alt="Screenshot 2023-09-10 at 22 50 12" src="https://github.com/neomjs/neo/assets/1177434/bd426cbf-79b3-4e4d-8f15-02cbbc21d940">

since we are using the value '50%' here, we should replace the NumberField with a TextField, to get rid of the warning plus a visible value inside the field.

@ExtAnimal 

## Timeline

- 2023-09-10T20:52:15Z @tobiu added the `bug` label
- 2023-09-10T20:52:16Z @tobiu assigned to @tobiu
- 2023-09-10T20:52:43Z @tobiu referenced in commit `08aff3c` - "examples.form.field.select.MainContainer: width control #4869"
- 2023-09-10T20:53:45Z @tobiu closed this issue
- 2023-09-11T14:00:25Z @tobiu referenced in commit `692bcf6` - "v6.4.0 (#4882)

* util.HashHistory: second() #4865

* Floating component auto-aligning (#4851)

* WIP

* component.Base: keeping render in sync with the latest change

* hotfix candidate for the width: null delta update

* WIP

* WIP

* WIP

* WIP

* floating needs z-index

* renaming the align_ config for grid & table header buttons

* examples cleanup

* moved the floating / alignment rules into a new cmp base scss file

* component.Base: method & config ordering, removed the async for update for now

* core.Base: method order

* main.DomAccess: method order

---------

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>

* examples.ConfigurationViewport: hotfix

* examples.form.field.select.MainContainer: removed the update() call after changing the style

* button.Base: afterSetMenu() => cleanup

* menu.List: removed onItemClick() => a list select will now show subMenus, otherwise this happens twice.

* menu.List: - testing log

* menu.List: showSubMenu() => added a negative top&left style to prevent menus showing up inside the top left corner for one frame.

* button.Base: afterSetMenu() => docs comment => added objects

* button.Base: destroy() #4867

* button.Base: destroy() #4867

* button.Base: toggleMenu() => focus() is no longer working for the 2+ show call #4868

* examples.form.field.select.MainContainer: width control #4869

* examples.form.field.select.MainContainer: cleanup

* Fix https://github.com/neomjs/neo/issues/4870

* Revert removal of Observable

* component.Base: cleanup

* Updated iconCls to remove serveral items which contain several cls in a single string.

* button.Base: adjust the initial main menu rendering position to a negative offset #4871

* menu.List: use a top-level background color #4872

* component.Base: getApp() => get app() refactoring #4874

* #4874 using the new app shortcut

* button.Base, menu.List => remove the negative offsets for showing popovers #4875

* #4873 examples.ConfigurationViewport: onSwitchTheme() => applying changes to the document.body

* component.Base: theme_ config #4876

* button.Base: afterSetTheme() => update the related list theme #4877

* menu.List: afterSetTheme() => pass the theme to child menus #4878

* form.field.Picker: afterSetTheme() => adjust the picker #4879

* remote method calls: ensure the appName (window identifier) is present #4880

* list.Base: method order

* form.Container: adjustTreeLeaves() => do not use assign: true for arrays #4881

* v6.4.0

---------

Co-authored-by: Nige White <nige.animal@gmail.com>
Co-authored-by: Torsten <td@m-gd.com>"

