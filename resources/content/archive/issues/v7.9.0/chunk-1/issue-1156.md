---
id: 1156
title: Setting class configs => different strategies (performance discussion)
state: CLOSED
labels:
  - help wanted
  - good first issue
  - discussion
  - stale
assignees: []
createdAt: '2020-09-01T11:31:10Z'
updatedAt: '2024-09-27T02:34:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1156'
author: tobiu
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-27T02:34:19Z'
---
# Setting class configs => different strategies (performance discussion)

Hi guys,

I could use your input / feedback on this one.

In case we are using non primitive class configs like "directions":
```
    static getConfig() {return {
        /**
         * @member {String} className='Neo.plugin.Resizable'
         * @protected
         */
        className: 'Neo.plugin.Resizable',
        /**
         * Directions into which you want to drag => resize
         * @member {String[]} directions_=['b','bl','br','l','r','t','tl','tr']
         */
        directions_: ['b', 'bl', 'br', 'l', 'r', 't', 'tl', 'tr'],
```

We have an Array here, it is even more important for Objects / Arrays with non primitive probs.

So, this Array is on the class / prototype level. In case we would change the values at run time, we will close to always only want to change it on instance level and not on class level (which would affect all yet to build instances and the prototypes of existing ones).

We also want to give the framework a chance to trigger a change event (triggering the afterSetDirections() method). This can not happen in case we change the same Array instance, since then the old & new value of the config are always the same.

Meaning: We have to clone non primitive configs at some point.

I see 3 different strategies:

1. Creating a clone inside the getter (not recommended)
2. Creating a clone inside the setter (current strategy)
3. Manually creating clones inside beforeGetX() or beforeSetX() methods

The first one does not sound reasonable, since there can be many read operations which don't change a config and creating clones would just be a not needed overhead.

**2. Creating a clone inside the setter (current strategy)**

```
            set(value) {
                let me        = this,
                    _key      = '_' + key,
                    uKey      = Neo.capitalize(key),
                    beforeSet = 'beforeSet' + uKey,
                    afterSet  = 'afterSet'  + uKey,
                    oldValue  = me[_key];

                // every set call has to delete the matching symbol
                delete me[configSymbol][key];

                if (key !== 'items') {
                    value = Neo.clone(value, true, true);
                }

                // we do want to store the value before the beforeSet modification as well,
                // since it could get pulled by other beforeSet methods of different configs
                me[_key] = value;

                if (me[beforeSet] && typeof me[beforeSet] === 'function') {
                    value = me[beforeSet](value, oldValue);

                    // If they don't return a value, that means no change
                    if (value === undefined) {
                        me[_key] = oldValue;
                        return;
                    }

                    me[_key] = value;
                }

                if (hasChanged(value, oldValue)) {
                    if (me[afterSet] && typeof me[afterSet] === 'function') {
                        me[afterSet](value, oldValue);
                    }
                }
            }
```

Please ignore the "items" exception. It feels very convenient for devs to always get a clone, since this nullifies the risk to change configs on prototype level. However, this means that every (including primitives) config needs to trigger Neo.clone(), which comes at a cost => performance.

**3. Manually creating clones inside beforeGetX() or beforeSetX() methods**

What we can do instead is using beforeGetX() or beforeSetX() methods to create clones as needed. In this case, getters can work, since it would not trigger Neo.clone() inside every getter.

This could make a pretty big impact on the performance of creating instances, especially reducing the time for the initial App rendering.

However, we can not expect devs to be smart enough to do this for every non primitive config, so there has to be a check. I am thinking about the applyClassConfigs logic: Check each config if it is not primitive (once!), log a warning in case there is no beforeGetX() method (or beforeSetX()) to point out that you need a clone.

This would slightly increase the total file size, since we need more manually created methods, but the performance gain can make a difference.

**Off topic**: You can always access the not cloned value directly using the leading underscore, e.g. `_myConfig`.

What are your thoughts?

Thx & best regards,
Tobi

## Timeline

- 2020-09-01T11:31:10Z @tobiu added the `help wanted` label
- 2020-09-01T11:31:10Z @tobiu added the `good first issue` label
- 2020-09-01T11:31:10Z @tobiu added the `discussion` label
### @tobiu - 2020-09-01T11:56:26Z

covid dashboard => initial rendering => 7737 set calls

### @ExtAnimal - 2020-09-08T17:29:29Z

The config system should cache the default values. And when the default configuration is called for, it should know which ones need to be cloned (arrays and objects) to protect the cached versions from mutation.

Ext and Bryntum core do this.

### @tobiu - 2020-09-08T17:46:05Z

Hi Nige,

thanks for your input. The config system will apply the default values on the prototype level, so we could call it caching.

Regarding "it should know": do you add an internal flag for each config like isPrimitive: true or do you check each one on runtime, (e.g. instanceof Object)?

I am in the middle of wrapping up the new build programs (split chunks & tree shaking for multiple apps). Will hopefully find some time afterwards to further think about the config system.

### @github-actions - 2024-09-13T02:31:06Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-13T02:31:07Z @github-actions added the `stale` label
### @github-actions - 2024-09-27T02:34:18Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-27T02:34:19Z @github-actions closed this issue

