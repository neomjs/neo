---
id: 7080
title: 'Feature Request: Refactor `core.Effect` to use new constructor signature'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-18T11:05:20Z'
updatedAt: '2025-07-18T11:30:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7080'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-18T11:30:10Z'
---
# Feature Request: Refactor `core.Effect` to use new constructor signature

**Reported by:** @tobiu on 2025-07-18

### Summary
The `core.Effect` constructor has been improved. This ticket tracks the work to update all `new Effect()` calls across the codebase to use the new, clearer single-object signature: `new Effect({ fn: ..., ... })`.

### Refactoring Targets

1.  **`src/functional/component/Base.mjs`**: Update `me.vdomEffect` in the constructor.
    
```javascript
    // from
    me.vdomEffect = new Effect(() => {
        me[hookIndexSymbol]        = 0;
        me[pendingDomEventsSymbol] = []; // Clear pending events for new render
        me[vdomToApplySymbol]      = me.createVdom(me, me.data)
    }, me.id, {
        id   : me.id,
        fn   : me.onEffectRunStateChange,
        scope: me
    });

    // to
    me.vdomEffect = new Effect({
        fn: () => {
            me[hookIndexSymbol]        = 0;
            me[pendingDomEventsSymbol] = []; // Clear pending events for new render
            me[vdomToApplySymbol]      = me.createVdom(me, me.data);
        },
        componentId: me.id,
        subscriber: {
            id   : me.id,
            fn   : me.onEffectRunStateChange,
            scope: me
        }
    });
```

2.  **`src/state/Provider.mjs`**: Update effects in `afterSetFormulas()` and `createBinding()`.

```javascript
    // from
    const effect = new Effect(() => { ... }, {lazy: true});

    // to
    const effect = new Effect({
        fn: () => { ... },
        lazy: true
    });
```

### Acceptance Criteria
- All `new Effect()` calls are refactored to use the single config object signature.
- All relevant tests continue to pass.

