---
id: 6597
title: Calendar - Basic - Windows Browsers (all of them) - Maximum Call Stack Size Exceeded error
state: CLOSED
labels:
  - bug
  - help wanted
  - no auto close
assignees: []
createdAt: '2025-03-30T18:11:02Z'
updatedAt: '2025-04-06T21:30:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6597'
author: cgauthier
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-04-06T21:30:08Z'
---
# Calendar - Basic - Windows Browsers (all of them) - Maximum Call Stack Size Exceeded error

When trying to load the Calendar demo (basic) in any windows browser, we get a maximum call stack size exceeded error which blocks the UI from rendering the component.

We suspect this code to to be the problem.
```
    getHierarchyData(data=this.getPlainData()) {
        let me     = this,
            parent = me.getParent();
            console.log("getHierarchyData - parent:");
            console.log(parent);
        if (parent) {
            return {
                ...parent.getHierarchyData(data),
                ...me.getPlainData()
            }
        }

        return me.getPlainData()
    }
```

![Image](https://github.com/user-attachments/assets/87b09ca9-8184-41cd-a093-665ed17cd73a)

## Timeline

- 2025-03-30T18:11:02Z @cgauthier added the `bug` label
- 2025-03-30T18:46:18Z @tobiu cross-referenced by #6598
- 2025-03-30T18:48:05Z @tobiu added the `help wanted` label
- 2025-03-30T18:48:05Z @tobiu added the `no auto close` label
### @tobiu - 2025-03-30T18:56:52Z

@cgauthier thanks for opening the ticket! sadly, I can not reproduce it on Mac OS (it works locally as well as inside the deployed version: https://neomjs.com/examples/calendar/basic/index.html )

```
    count = 1

    /**
     * Returns the merged data
     * @param {Object} data=this.getPlainData()
     * @returns {Object} data
     */
    getHierarchyData(data=this.getPlainData()) {
        let me     = this,
            parent = me.getParent();

        console.log(me.id, parent, me.count);
        me.count++;

        if (parent) {
            return {
                ...parent.getHierarchyData(data),
                ...me.getPlainData()
            }
        }

        return me.getPlainData()
    }
```

<img width="1517" alt="Image" src="https://github.com/user-attachments/assets/33d240d5-acda-4779-bcb3-b31275b34995" />

If I recall it correctly, you got more method calls than I do => for me it is 22x of `getHierarchyData()`.

Since `parent` is always `null`, it leaves us with 2 options where the issue most likely happens.
1. Inside `getPlainData()`
2. `onDataPropertyChange()` gets called more often on windows

I added the "help wanted" label to this ticket, since I don't have windows installed here => I can not verify that a hotfix candidate actually resolves it.

### @tobiu - 2025-03-30T19:03:41Z

```
    getPlainData(data=this.data) {
        let plainData = {};

        console.log(Object.entries(data).length);

        Object.entries(data).forEach(([key, value]) => {
            if (Neo.typeOf(value) === 'Object') {
                plainData[key] = this.getPlainData(value)
            } else {
                plainData[key] = value
            }
        });

        return plainData
    }
```

This logs 22x:
<img width="380" alt="Image" src="https://github.com/user-attachments/assets/5912e61c-7f40-4459-a899-a5ae9d1fc116" />

which looks fine: https://github.com/neomjs/neo/blob/dev/src/calendar/view/MainContainerStateProvider.mjs

12 top level properties inside `data`, 4 properties inside `data.events`, 2 properties inside `data.timeFormat`.

### @tobiu - 2025-03-30T19:08:54Z

```
    onDataPropertyChange(key, value, oldValue) {
        let me      = this,
            binding = me.bindings && Neo.ns(key, false, me.bindings),
            component, config, hierarchyData, stateProvider;
console.log(key, value);
        // ...
    }
```

<img width="423" alt="Image" src="https://github.com/user-attachments/assets/53d3ceee-d8a7-4b09-9627-8e0791a918cb" />

this part also looks fine on Mac OS. `onDataPropertyChange()` only gets called once for each data property.

- 2025-04-06T21:27:53Z @tobiu referenced in commit `34d6eb0` - "Calendar - Basic - Windows Browsers (all of them) - Maximum Call Stack Size Exceeded error #6597"
- 2025-04-06T21:28:53Z @tobiu referenced in commit `8d418bc` - "#6597 cleanup"
### @tobiu - 2025-04-06T21:30:08Z

as it turned out, this was not a windows issue, but UTC vs later starting timezones (e.g. USA).
thanks a lot @cgauthier for the debugging session!

while it is working now, it needs follow up tickets.

- 2025-04-06T21:30:08Z @tobiu closed this issue

