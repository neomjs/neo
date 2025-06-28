Pre-requisite: Please study benefits / Unified Class Config System first.

## Dynamic Configuration & afterSet Handlers: An In-depth Example

Let's further explore dynamic configuration changes and the role of `afterSet` methods with the Neo.examples.core.config.
MainContainer [Source: MainContainer.mjs]. This example highlights how declarative UI structures defined in
static config can be combined with reactive updates based on other config properties.

**Original MainContainer with items in construct (for context)**

The original `MainContainer.mjs` defined its `items` array inside the `construct` method.
This allowed for procedural creation of child components.

```javascript readonly
// From: Neo.examples.core.config.MainContainer (original approach)
import Panel    from '../../../src/container/Panel.mjs';
import Viewport from '../../../src/container/Viewport.mjs';

class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.core.config.MainContainer',
        a_       : null,
        b_       : null,
        style    : { padding: '20px' }
    }
    
    construct(config) {
        super.construct(config);
        let me = this;

        me.items = [{ // Items defined here
            module: Panel,
            containerConfig: { layout: {ntype: 'vbox', align: 'start'}, style : {padding: '20px'} },
            headers: [{
                dock : 'top',
                items: [{ ntype: 'label', flag : 'label1' }, { ntype: 'label', flag : 'label2' }, { ntype: 'component', flex : 1 }, {
                    handler: me.changeConfig.bind(me), // Bound handler
                    iconCls: 'fa fa-user',
                    text   : 'Change configs'
                }]
            }],
            items: [{ ntype: 'label', text : 'Click the change configs button!' }]
          }]
    }
    // ... changeConfig, afterSetA, afterSetB, onConstructed methods
}
```

**Refactored `MainContainer` with `items` in `static config` and Declarative Handler**

To fully embrace the declarative nature of the class config system, the entire `items` array can be moved into the
`static config` block. This makes the component's structure visible at a glance within its static definition.
When moving the `handler`, we can leverage Neo.mjs's declarative event handling by using `'up.methodName'`,
which tells the framework to look for methodName on the direct parent instance or higher in the component hierarchy.

```javascript readonly
// Refactored Neo.examples.core.config.MainContainer (recommended approach)
import Panel    from '../../../src/container/Panel.mjs';
import Viewport from '../../../src/container/Viewport.mjs';

class MainContainer extends Viewport {
    static config = {
        className: 'Neo.examples.core.config.MainContainer',
        a_       : null,
        b_       : null,
        style    : { padding: '20px' },
        /**
         * @member {Object[]} items
         */
        items: [{ // Items now defined declaratively within static config
            module: Panel,
            containerConfig: {
                layout: {ntype: 'vbox', align: 'start'},
                style : {padding: '20px'}
            },
            headers: [{
                dock : 'top',
                items: [{
                    ntype: 'label',
                    flag : 'label1'
                }, {
                    ntype: 'label',
                    flag : 'label2'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    handler  : 'up.changeConfig', // Declarative handler: 'up' references the parent instance (MainContainer)
                    iconCls  : 'fa fa-user',
                    text     : 'Change configs'
                }]
            }],
            items: [{
                ntype: 'label',
                text : 'Click the change configs button!'
            }]
        }]
    }

    // `construct` method would now be simpler or removed if no other logic is needed here
    construct(config) {
        super.construct(config);
        // Any other non-config related construction logic would go here
    }

    // ... changeConfig, afterSetA, afterSetB, onConstructed methods (remain the same)
}
```

This refactored version clearly demonstrates the power of defining the entire component hierarchy and event wiring
declaratively within `static config`, reducing the need for imperative UI construction in `construct`.

**Initializing Config Values with `onConstructed`**

The `onConstructed` lifecycle method sets the initial values of `a` and `b`:

```javascript readonly
onConstructed() {
    super.onConstructed();
  
    this.set({
        a: 5,
        b: 5
    })
}
```

When `this.set({a: 5, b: 5})` is called, both `this.a` and `this.b` are updated to `5`.
This triggers their respective `afterSet` methods.

**Reactive Updates with `afterSetA` and `afterSetB`**

The `afterSetA` and `afterSetB` methods react to changes in `a` and `b`, respectively,
by updating the text of the `label1` and `label2` components.

```javascript readonly
afterSetA(value, oldValue) {
    if (oldValue !== undefined) {
        this.down({flag: 'label1'}).text = value + this.b
    }
}

afterSetB(value, oldValue) {
    if (oldValue !== undefined) {
        this.down({flag: 'label2'}).text = value + this.a
    }
}
```

**Important Note on Circular Reference (or Mutual Dependency)**:

As you astutely observed, the logic within `afterSetA() (value + this.b)` and `afterSetB() (value + this.a)` showcases a
mutual dependency. When `this.set({a: X, b: Y})` is called:

// TODO: wrong
Neo.mjs first updates both `this.a` to `X` and `this.b` to `Y` by setting their internal backing properties (`_a` and `_b`).

Then, it triggers `afterSetA` and `afterSetB`. When `afterSetA` executes and accesses `this.b`, it uses the auto-generated
getter for `b`. This getter immediately returns the new value of `b` (which is `Y`) from `this._b`, even though `afterSetB`
might not have been executed yet in the processing queue.

This ensures that all afterSet methods, regardless of their trigger order within a single `set()` operation,
always operate on the most current and consistent state of all config properties involved.

**`changeConfig` Method: Triggering Dynamic Updates**

The `changeConfig` method is called when the "Change configs" button is clicked.

```javascript readonly
changeConfig(data) {
    this.set({
        a: 10,
        b: 10
    })
}
```

This demonstrates how an action (button click) can declaratively update config properties,
which then automatically trigger the reactive `afterSet` handlers.

**Calculating Label Texts**

Let's trace the values:

1. **Initial State (After `onConstructed` executes)**:
* `this.set({a: 5, b: 5})` is called.
* `this.a` becomes `5` and `this.b` becomes `5` (internally).
* `afterSetA` is triggered: `this.down({flag: 'label1'}).text = 5 + this.b` (which is `5 + 5 = 10`).
* `afterSetB` is triggered: `this.down({flag: 'label2'}).text = 5 + this.a` (which is `5 + 5 = 10`).
* **Initial Label Texts**: `label1`: "10", `label2`: "10"

2. **After Clicking "Change configs" Button**:
* `this.set({a: 10, b: 10})` is called.
* `this.a` becomes `10` and `this.b` becomes `10` (internally).
* `afterSetA` is triggered: `this.down({flag: 'label1'}).text = 10 + this.b` (which is `10 + 10 = 20`).
* `afterSetB` is triggered: `this.down({flag: 'label2'}).text = 10 + this.a` (which is `10 + 10 = 20`).
* **Label Texts after clicking "Change configs"**: `label1`: "20", `label2`: "20"

This example vividly demonstrates the dynamic and reactive nature of Neo.mjs's class config system, where changes to
config properties automatically propagate and trigger updates in the UI or other dependent logic.

### 6.1. The Internal Mechanics: set(), processConfigs(), and configSymbol

To fully appreciate how Neo.mjs achieves this powerful and consistent behavior, it's essential to understand the internal
workings of the `set()` and `processConfigs()` methods in `Neo.core.Base`, and how they leverage the `configSymbol` and
auto-generated getters from `autoGenerateGetSet()`.

The core mechanism for managing config values and resolving potential circular dependencies relies on the internal
`configSymbol` and a carefully orchestrated process of assigning and re-assigning values.

**The `set()` Method (`Neo.core.Base`)**

The `set()` method is the public interface for changing one or more config properties at once
[[Source: core.Base.mjs](https://github.com/neomjs/neo/blob/dev/src/core/Base.mjs)].

```javascript readonly
set(values={}) {
    let me = this;
  
    values = me.setFields(values);
  
    // If the initial config processing is still running,
    // finish this one first before dropping new values into the configSymbol.
    if (me[forceAssignConfigs] !== true && Object.keys(me[configSymbol]).length > 0) {
        me.processConfigs()
    }
  
    Object.assign(me[configSymbol], values); // (A)
    me.processConfigs(true) // (B)
}
```

Here's what happens:

* `values = me.setFields(values);`: This first assigns any non-config class fields directly to the instance
  and removes them from the `values` object. This ensures that if an `afterSet` method or `beforeSet` method
  tries to access a non-config field that was part of the same `set()` call, it already has the new value.
* **Pre-processing**: The if condition checks `if` there are pending configs from a previous `initConfig()` call
  (during instance construction) that haven't been fully processed yet. If so, `me.processConfigs()` is called without
  `forceAssign=true` to finish that initial processing. This ensures a clean state before new values are introduced.
* `Object.assign(me[configSymbol], values);` **(A)**: This is a critical step. All new config values passed to `set()`
  are first merged into the `configSymbol` internal object. The configSymbol acts as a temporary holding area for all
  pending config updates. This ensures that even if you set multiple configs (`a` and `b`) in a single `set()` call,
  their values are all available within the `configSymbol` object before any individual setter or `afterSet` hook is called.
* `me.processConfigs(true)` **(B)**: Finally, `processConfigs(true)` is called to actually apply the values from
  `configSymbol` to the instance's properties. The `true` argument for `forceAssign` is crucial here.

**The `processConfigs()` Method (`Neo.core.Base)**

This method iteratively processes the configs stored in `configSymbol`
[[Source: core.Base.mjs](https://github.com/neomjs/neo/blob/dev/src/core/Base.mjs)]:

```javascript readonly
processConfigs(forceAssign=false) {
    let me   = this,
        keys = Object.keys(me[configSymbol]); // Get keys of pending configs
  
    me[forceAssignConfigs] = forceAssign; // Set internal flag
  
    // We do not want to iterate over the keys, since 1 config can remove more than 1 key (beforeSetX, afterSetX)
    if (keys.length > 0) {
        // The hasOwnProperty check is intended for configs without a trailing underscore
        // => they could already have been assigned inside an afterSet-method
        if (forceAssign || !me.hasOwnProperty(keys[0])) { // (C)
            me[keys[0]] = me[configSymbol][keys[0]] // (D)
        }
    
        // there is a delete-call inside the config getter as well (Neo.mjs => autoGenerateGetSet())
        // we need to keep this one for configs, which do not use getters (no trailing underscore)
        delete me[configSymbol][keys[0]]; // (E)
    
        me.processConfigs(forceAssign) // (F) - Recursive call
    }
}
```

Here's the detailed flow and how it handles dependencies:

* **Iteration and `configSymbol`**: `processConfigs` operates by taking the first key from `Object.keys(me[configSymbol])`.
  It doesn't use a traditional loop (`for` or `forEach`) to avoid issues if a setter or `afterSet` hook modifies the
  `configSymbol` itself. Instead, it's a recursive call (`me.processConfigs(forceAssign)`).

* **`forceAssignConfigs` Flag**: The `me[forceAssignConfigs] = forceAssign;` line sets an internal flag.
  This flag is used by the auto-generated setters (from `autoGenerateGetSet` in Neo.mjs) to differentiate between initial
  config processing (where `forceAssign` is `true` after a `set()` call) and subsequent explicit `set` calls within `afterSet` hooks.

* **`hasOwnProperty` Check (C)**: `if (forceAssign || !me.hasOwnProperty(keys[0]))`:
    * If `forceAssign` is `true` (which it is after a `set()` call), the condition is met, and the assignment proceeds.
    * If `forceAssign` is `false` (as during initial `initConfig` calls), it checks `!me.hasOwnProperty(keys[0])`.
      This is important because configs without a trailing underscore (`_`) can be directly assigned, potentially by other
      `afterSet methods`. If a property already exists directly on the instance (meaning its value has already been resolved
      or set), `hasOwnProperty` would be `true`, and the assignment `(D)` is skipped for that config to avoid redundant processing.

* **Assignment (D)**: `me[keys[0]] = me[configSymbol][keys[0]]`:
    * This line triggers the actual setter for the config property (e.g., `setMyConfig`). When the setter executes:
        * It reads the `value` from `me[configSymbol][keys[0]]`.
        * It gets the `oldValue` from the instance's internal `_` property.
        * It updates the internal `_` property with the `value` (the new value).
        * It runs the beforeSet hook (if any), which can modify the value.
        * **Crucially, if a genuine change is detected (`!Neo.isEqual(value, oldValue)`), it then triggers the `afterSet` hook.**

* **Deletion from configSymbol (E)**: `delete me[configSymbol][keys[0]]`: Once a config property's setter has been invoked,
  it's removed from the `configSymbol`. This prevents reprocessing and indicates that this specific config has been handled.

* **Recursive Call (F)**: `me.processConfigs(forceAssign)`: The method calls itself recursively. This ensures that the
  next pending config in `configSymbol` (if any) is processed. The recursion continues until
  `Object.keys(me[configSymbol]).length` is 0, meaning all pending configs have been processed.

**How Dependencies are Handled (Revisiting the MainContainer Example)**

The combination of `configSymbol` as a staging area and the getters generated by `autoGenerateGetSet()` ensures that when
`afterSet` hooks are triggered, they always have access to the most up-to-date values of other configs included
in the same `set()` operation.

Let's re-examine the `onConstructed` example with `a` and `b`:

```javascript readonly
onConstructed() {
    super.onConstructed();
  
    this.set({
        a: 5,
        b: 5
    })
}
```

1. **Staging**: When `this.set({a: 5, b: 5}) is called, both `a: 5` and `b: 5` are immediately placed into the `me[configSymbol]` object.
2. **Processing `a` (Example Order)**: `processConfigs` picks `a`. When `me.a = 5` (which triggers `setA` from `autoGenerateGetSet()`) is called:
* `this._a` is updated to `5`.
* `afterSetA` is triggered.

3. **Accessing `b` in `afterSetA`**: Inside afterSetA, the expression this.b triggers the getter for b.
* This getter does not re-process `b` through `processConfigs`. Instead, it simply retrieves the value from `this._b`.
* Since `this._b` was already updated to `5` when the original `set({a: 5, b: 5})` call initially staged all values,
  the getter for `b` correctly returns `5`.

4. **Result**: `this.down({flag: 'label1'}).text = value + this.b` correctly calculates `5 + 5 = 10`.

5. **Processing `b` (Subsequent)**: Later in the `processConfigs` recursion, `b` will be picked. Its setter will run,
   `this._b` will be updated (to the same value, `5`), and `afterSetB` will be triggered, correctly calculating
   `value + this.a` as `5 + 5 = 10`.

This means that even if `afterSetA` executes before `afterSetB` (or vice-versa), `this.a` and `this.b` will always reflect
their new values from the ongoing `set()` operation. The `configSymbol` acts as a consistent snapshot of all intended
new values for the entire `set()` operation, allowing dependencies to correctly resolve against these pending new values
even before all setters have completed their afterSet calls.

This sophisticated yet transparent mechanism is what makes Neo.mjs's declarative config system so powerful and reliable,
enabling complex inter-config dependencies without concerns about timing or inconsistent data.
