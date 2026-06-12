---
id: 245
title: autoGenerateGetSet() => set() => break if beforeSet has no return value
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2020-02-25T11:17:10Z'
updatedAt: '2020-02-25T11:20:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/245'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-02-25T11:20:27Z'
---
# autoGenerateGetSet() => set() => break if beforeSet has no return value

see #242 (Nige)

```
            if (me[beforeSet] && typeof me[beforeSet] === 'function') {
                value = me[beforeSet](value, oldValue);

                // If they don't return a value, that means no change
                if (value === undefined) {
                    return;
                }
            }
```

The idea is eg
```
beforeSetStartDate(newDate, oldDate) {
    if (typeof newDate === 'string') {
        newDate = DateHelper.parse('YYYY-MM-DD');
    }

    // Only return a value if it's a *valid* value (!isNaN) and is actually changed.
    // undefined return value means the change is vetoed - the calling code returns early.
    if (!isNaN(newDate) && (!oldDate || oldDate.valueOf() !== newDate.valueOf())) {
        return newDate;
    }
}
```

Without the change, each beforeSet method with if conditions would need something like
```
else {
    return oldValue;
}
```

so it might shorten the app code a little bit. I will give it a try, although `return undefined;` might cause issues in case it ever happens.

## Timeline

- 2020-02-25T11:17:10Z @tobiu added the `enhancement` label
- 2020-02-25T11:19:32Z @tobiu referenced in commit `f2f1f37` - "autoGenerateGetSet() => set() => break if beforeSet has no return value #245"
### @tobiu - 2020-02-25T11:20:26Z

done.

- 2020-02-25T11:20:27Z @tobiu closed this issue

