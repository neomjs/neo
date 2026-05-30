---
id: 242
title: 'core.Base: state management using a modified getter'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-02-24T17:18:12Z'
updatedAt: '2020-03-16T11:49:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/242'
author: tobiu
commentsCount: 6
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-16T11:49:28Z'
---
# core.Base: state management using a modified getter

pondering ticket.

instead of using the afterSetQueue, add a tmp. class prop to store the new config values object.

then modify the autoGen getters to check for this object first and in case it does exist use it.

instance.set() would then create this object, assign the values and delete it.

goal: make all new values available inside the beforeGetXXX methods as well, although circular references there feel a bit ambiguous for the new value.

a=1, b=2
```
beforeSetA(val) {return val + this.b;}
beforeSetB(val) {return val + this.a;}
```

these 3 ways will create different outputs:

1.
```
inst.set({a:2, b:3});
// a=5, b=5
```

2.
```
inst.a = 2;
inst.b = 3; 
// a = 4, b = 7
```

3.
```
inst.b = 3; 
inst.a = 2;
// a = 8, b = 6
```

## Timeline

- 2020-02-24T17:18:12Z @tobiu added the `enhancement` label
- 2020-02-24T17:18:12Z @tobiu assigned to @tobiu
### @ExtAnimal - 2020-02-24T18:04:52Z

The problem is in the queueing concept: https://github.com/neomjs/neo/blob/fe9804d8cd65da0da8a60e21514dda28331227b5/src/Neo.mjs#L583

Setting all the values, and *then*, in a separate run through, calling afterSet on each one? 

That still doesn't help configs which depend upon other configs being fully set and postprocessed.

If the postprocessing of config `a` reads config `z`, and needs that `z`'s `afterSet` has done its stuff, then that's a problem. The configs are still iterated *in order*. It will get the *unprocessed* value of `z`. Only having initGetters will fix this.

afterSet should be called right there after `me[_key] = value`

Also line 574 should be

```
            if (me[beforeSet] && typeof me[beforeSet] === 'function') {
                value = me[beforeSet](value, oldValue);

                // If they don't return a value, that means no change
                if (value === undefined) {
                    return;
                }
            }
```

Also, the object that you create in `autoGenerateGetSet`. It is the same for each `key` name. The property definition object for property `foo` in one class will be exactly the same as for another class. These can be cached statically and reused.



- 2020-02-24T18:33:38Z @tobiu cross-referenced by #244
### @tobiu - 2020-02-24T18:44:00Z

Hi Nige,

thanks for your input! I am not 100% sure about this part:
```
            if (me[beforeSet] && typeof me[beforeSet] === 'function') {
                value = me[beforeSet](value, oldValue);

                // If they don't return a value, that means no change
                if (value === undefined) {
                    return;
                }
            }
```
not having a return value inside a beforeGetXXX method is not supposed to happen.

in case it would, this could mean:
1. keep the old value
2. use the unprocessed new value

in theory you could even use `return undefined;` (not saying it is smart), which would then keep the old value.

those were my reasons not to do it so far. thoughts?

agree on 
> afterSet should be called right there after me[_key] = value

in case it does work out with the getters adjustment (well, this ticket is intended as a replacement for the queue).

> If the postprocessing of config a reads config z, and needs that z's afterSet has done its stuff, then that's a problem. The configs are still iterated in order. It will get the unprocessed value of z. Only having initGetters will fix this.

see my examples above: i am still not 100% sure if this can resolve circular dependencies for beforeSet methods in a way that we always get the same results not related to the order. will create more tests once i have time.

### @ExtAnimal - 2020-02-25T10:26:01Z

The idea is eg

```
changeStartDate(newDate, oldDate) {
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

### @ExtAnimal - 2020-02-25T10:28:31Z

The `value !== oldValue` test here: https://github.com/neomjs/neo/blob/dev/src/Neo.mjs#L581

That won't work for more complex cases. For example dates. Two Date objects for the *same date* are unequal.

- 2020-02-25T11:17:10Z @tobiu cross-referenced by #245
### @tobiu - 2020-02-25T11:28:00Z

Hi Nige,

thx again for your input! I will create a new ticket for this one:
```
// todo: we could compare objects & arrays for equality
if (Neo.isObject(value) || Array.isArray(value) || value !== oldValue) {
```

I am trying to keep tickets granular to avoid sub-items getting lost.

- 2020-02-25T11:39:55Z @tobiu cross-referenced by #246
- 2020-03-02T10:22:26Z @tobiu referenced in commit `5925864` - "#242: initGetters() shell"
- 2020-03-02T10:28:47Z @tobiu referenced in commit `cc4679e` - "#242: autoGenerateGetSet() => removed the afterSetQueue"
- 2020-03-02T10:30:27Z @tobiu referenced in commit `4adc469` - "#242: removed addToAfterSetQueue, processAfterSetQueue"
- 2020-03-02T10:37:11Z @tobiu referenced in commit `035c02a` - "#242: core.Base => removed the afterSetQueue symbol"
- 2020-03-02T11:11:17Z @tobiu referenced in commit `8bead6f` - "#242: Symbol.for() testing"
- 2020-03-05T08:15:20Z @tobiu referenced in commit `e657951` - "#242: core.Base => [configSymbol] as a defined property"
- 2020-03-05T08:23:09Z @tobiu referenced in commit `1455ebe` - "#242: config getter => check for me[configSymbol]"
- 2020-03-05T08:32:14Z @tobiu referenced in commit `98e3022` - "#242: core.Base => adjusted the set() logic"
- 2020-03-05T08:48:03Z @tobiu referenced in commit `69c7701` - "#242: core.Base => initGetters() logic"
- 2020-03-05T09:12:48Z @tobiu referenced in commit `2e10924` - "#242: config getter => improvements for using the configSymbol"
- 2020-03-05T09:39:16Z @tobiu referenced in commit `b9e2cf9` - "#242: core.Base => set() & initConfig() improvements"
- 2020-03-05T09:49:43Z @tobiu cross-referenced by PR #250
- 2020-03-05T10:11:43Z @tobiu referenced in commit `6a8ba18` - "#242: autoGenerateGetSet() => get() => triggering the setters for new configs"
- 2020-03-05T10:22:55Z @tobiu referenced in commit `051c63a` - "#242: core.Base: initGetters() renamed to processConfigs()"
- 2020-03-05T10:27:46Z @tobiu referenced in commit `e6e94a8` - "#242: core.Base: set() comment"
- 2020-03-05T10:42:58Z @tobiu referenced in commit `aae325c` - "#242 collection.Base, data.Store => removed mergeConfig()"
- 2020-03-05T10:53:17Z @tobiu referenced in commit `b3caae9` - "#242: autoGenerateGetSet() => get() => deleting the symbol value before triggering the setter"
- 2020-03-05T13:12:52Z @tobiu referenced in commit `53983fc` - "#242: autoGenerateGetSet() => the configSymbol for a given key has to be deleted inside the setter() => x-dependencies"
- 2020-03-05T13:40:06Z @tobiu cross-referenced by PR #251
- 2020-03-05T13:40:19Z @tobiu referenced in commit `1aa0fb7` - "Merge pull request #251 from neomjs/#242

#242"
### @tobiu - 2020-03-16T11:49:27Z

guess we can close this one now (implemented).

- 2020-03-16T11:49:28Z @tobiu closed this issue

