---
id: 5011
title: 'form.field.Text: editable_ config'
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-10-12T10:41:39Z'
updatedAt: '2024-09-13T02:28:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5011'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:28:57Z'
---
# form.field.Text: editable_ config

We now have a logic clash of the following 2 methods:
```
    afterSetEditable(value, oldValue) {
        const
            me      = this,
            { cls } = me;

        NeoArray.toggle(cls, 'neo-not-editable', !value);
        me.cls = cls
        me.changeInputElKey('readonly', value ? false : true);

        me.triggers?.forEach(trigger => {
            trigger.hidden = value ? true : trigger.getHiddenState?.() || false
        });
    }

    afterSetReadOnly(value, oldValue) {
        let me  = this,
            cls = me.cls;

        NeoArray[value ? 'add' : 'remove'](cls, 'neo-readonly');
        me.cls = cls;

        me.changeInputElKey('readonly', value ? value : null);

        me.triggers?.forEach(trigger => {
            trigger.hidden = value ? true : trigger.getHiddenState?.() || false
        })
    }
```

If a field has `editable: false` and `readOnly: false`, assuming that the editable config will get set first, the first method will hide the triggers and the second one will show them again.

We need a new method like updateTriggerVisibiliby() which honors the combination of both configs and gets called in both afterSet methods.

`afterSetEditable()` should not hide triggers by default though, so in case we remove the part in there, we don't need the new method.

I am still not sure, if applying `readonly` on DOM level is a smart idea for fields that a user has to fill. accessibility (screen readers) => confusing. Not sure if we can make a field work **like** it is readonly, without using the DOM attribute (just CSS).

## Timeline

- 2023-10-12T10:41:39Z @tobiu added the `bug` label
### @tobiu - 2023-10-12T10:59:28Z

https://github.com/neomjs/neo/assets/1177434/389c367b-95b3-4cc5-aa92-77682dea9db7

### @github-actions - 2024-08-29T02:26:32Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:32Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:28:56Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:28:57Z @github-actions closed this issue

