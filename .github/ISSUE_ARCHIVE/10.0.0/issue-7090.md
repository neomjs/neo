---
id: 7090
title: Architecturally Refactor core.Observable to a Fully Reactive Mixin
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-21T22:37:11Z'
updatedAt: '2025-07-22T05:33:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7090'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-07-22T05:33:33Z'
---
# Architecturally Refactor core.Observable to a Fully Reactive Mixin

**Reported by:** @tobiu on 2025-07-21

## 1. Motivation & Goals

The `core.Observable` mixin, while functional, was implemented using an older, imperative pattern that was inconsistent with the framework's modern reactive config system. The primary goal of this refactoring is to modernize `Observable` to be a first-class, reactive, and self-contained mixin.

This involves:
1.  **Adopting the Reactive Config Pattern:** Replacing the old `listeners` property with a reactive `listeners_` config.
2.  **Eliminating Manual Initialization:** Removing the `initObservable()` call from `core.Base` to allow the standard `initConfig` lifecycle to manage the mixin's setup.
3.  **Establishing True Encapsulation:** Creating a clear and robust separation between the mixin's public configuration API and its private internal state.

## 2. The Refactoring Process & Challenges

The refactoring was executed in two main phases, which revealed a critical architectural challenge:

**Phase 1: Modernization**
*   The `listeners` config in `core.Observable` was converted to a reactive `listeners_` config. This enables the use of the standard `afterSetListeners()` hook to bridge the declarative config with the imperative `on()` and `un()` methods.
*   The corresponding manual call, `me.initObservable(config)`, was removed from `core.Base.construct()`. This was a crucial step to stop the premature and conflicting initialization of the listeners.

**Phase 2: The Regression & The Solution**
*   **The Challenge:** The initial refactoring led to a regression where declaratively set listeners (e.g., `onBlogSearchFieldChange`) stopped firing. The root cause was that the mixin was incorrectly attempting to use the public `listeners_` config object as its internal, structured event registry. This conflation of public API and private state is an anti-pattern that caused a `TypeError`.
*   **The Solution:** To fix this, a second, truly private internal storage mechanism was introduced. After exploring and rejecting private class fields (which are technically impossible in a mixin due to the JS lifecycle) and non-reactive configs (which pollute the public API), the architecturally correct solution was chosen: a **module-scoped `Symbol`**.

## 3. Final Architecture

The final, robust architecture of `core.Observable` is now:

1.  **Public API (`listeners_`):** A clean, declarative, and reactive config for developers to define listeners at creation time.
2.  **Private State (`eventMapSymbol`):** A module-scoped `Symbol` acts as a unique, non-colliding key for the internal event registry. This registry is a true private implementation detail, completely decoupled from the config system.
3.  **Lifecycle Bridge (`afterSetListeners`):** This hook cleanly translates the declarative `listeners_` config into imperative `on()` and `un()` calls, which operate exclusively on the private, symbol-keyed registry.

This new architecture makes `core.Observable` a fully encapsulated, self-sufficient, and maintainable mixin that aligns perfectly with the framework's core principles.

## 4. Implementation & Bug Fix

The implementation uses the `eventMapSymbol` for all internal event management. A lingering bug was also found and fixed in the `removeListener` method, which was still incorrectly attempting to read from `me.listeners` in one code path.

```javascript
// src/core/Observable.mjs

import Base              from './Base.mjs';
import NeoArray          from '../util/Array.mjs';
import {isDescriptor}    from '../core/ConfigSymbols.mjs';
import {resolveCallback} from '../util/Function.mjs';

/**
 * A unique, non-enumerable key for the internal event map.
 * Using a Symbol prevents property name collisions on the consuming class instance,
 * providing a robust way to manage private state within a mixin.
 * @type {Symbol}
 */
const eventMapSymbol = Symbol('eventMap');

/**
 * @class Neo.core.Observable
 * @extends Neo.core.Base
 */
class Observable extends Base {
    static config = {
        /**
         * @member {String} className='Neo.core.Observable'
         * @protected
         */
        className: 'Neo.core.Observable',
        /**
         * @member {String} ntype='mixin-observable'
         * @protected
         */
        ntype: 'mixin-observable',
        /**
         * A declarative way to assign event listeners to an instance upon creation.
         * The framework processes this config and calls `on()` to populate the
         * internal event registry. This config should not be manipulated directly after
         * instantiation; use `on()` and `un()` instead.
         * @member {Object|null} listeners_
         * @reactive
         */
        listeners_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : {}
        }
    }

    /**
     * @param {Object|String} name
     * @param {Function|String} [eventId]
     * @param {Neo.core.Base} [scope]
     */
    removeListener(name, eventId, scope) {
        let me = this,
            i, len, listener, listeners, match;

        // LAZY INITIALIZATION: Ensure the internal listener store exists.
        me[eventMapSymbol] ??= {};

        if (Neo.isFunction(eventId)) {
            me.removeListener({[name]: eventId, scope});
            return
        }

        if (Neo.isObject(name)) {
            if (name.scope) {
                scope = name.scope;
                delete name.scope;
            }

            Object.entries(name).forEach(([key, value]) => {
                // CORRECTED: Always use the private, symbol-keyed map
                listeners = me[eventMapSymbol][key] || [];
                i         = 0;
                len       = listeners.length;

                for (; i < len; i++) {
                    listener = listeners[i];

                    if (
                        listener.fn.name === (Neo.isString(value) ? value : value.name) &&
                        listener.scope   === scope
                    ) {
                        listeners.splice(i, 1);
                        break
                    }
                }
            })
        } else if (Neo.isString(eventId)) {
            listeners = me[eventMapSymbol][name];
            match     = false;

            if (listeners) {
                listeners.forEach((eventConfig, idx) => {
                    if (eventConfig.id === eventId) {
                        return match = idx
                    }
                });

                if (match !== false) {
                    listeners.splice(match, 1)
                }
            }
        }
    }

    // ... other methods like addListener, fire, on, un ...
}

export default Neo.setupClass(Observable);
```

## Comments

### @tobiu - 2025-07-22 05:32

missed one change.

