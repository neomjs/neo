# Deep Dive: The State Provider Revolution

**Subtitle: How Neo.mjs Delivers Intuitive State Management Without the Performance Tax**

In our "Three-Act Revolution" series, we've explored the high-level concepts of Neo.mjs v10. Now, it's time to dive deep
into the technology that powers **Act I: The Reactivity Revolution**. We'll explore the new `state.Provider`, a system
designed to solve one of the most persistent challenges in application development: managing shared state.

*(Part 5 of 5 in the v10 blog series. Details at the bottom.)*

### 1. The Problem: Prop-Drilling and the "Context Tax"

Every application developer knows the pain. You have a piece of state—a user object, a theme setting—that needs to be
accessed by a component buried deep within your UI tree. The traditional approach is "prop-drilling": passing that data
down through every single intermediate component. It's tedious, error-prone, and creates a tight coupling between
components that shouldn't know about each other.

Modern frameworks solve this with a "Context API," a central provider that makes state available to any descendant.
While this solves prop-drilling, it often introduces a hidden performance penalty: the "Context Tax." In many
implementations, when *any* value in the context changes, *all* components consuming that context are forced to re-render,
even if they don't care about the specific piece of data that changed. This can lead to significant,
unnecessary rendering work.

Neo.mjs v10's `state.Provider` is designed to give you the convenience of a context API without this performance tax.

### 2. The Neo.mjs Solution: From Custom Parsing to a Universal Foundation

Neo.mjs has had a state provider for a long time, and it was already reactive. So, what’s the big deal with the v10 version?
The difference lies in the *foundation*.

The previous state provider was a clever, custom-built system. It worked by parsing your binding functions with regular
expressions to figure out which `data` properties you were using. This was effective, but had two major limitations:

1.  **It Only Worked for `data`:** You could only bind to properties inside the provider's `data` object. Binding to an
    external store's `count` or another component's `width` was simply not possible.
2.  **It Was Brittle:** Relying on regex parsing meant that complex or unconventionally formatted binding functions could
    sometimes fail to register dependencies correctly, leading to frustrating debugging sessions.

The v10 revolution was to throw out this custom parsing logic and rebuild the entire state management system on top of a
universal, foundational concept: **`Neo.core.Effect`**.

This new foundation is what makes the modern `state.Provider` so powerful. It doesn't need to guess your dependencies;
it *knows* them. When a binding function runs, `core.Effect` observes every reactive property you access—no matter where
it lives—and builds a precise dependency graph in real-time.

The result is an API that is not only more powerful but also simpler and more intuitive, especially when it comes to
changing state. The provider does what you would expect, automatically handling complex scenarios like deep merging.

Where the magic truly begins is in how you *change* that data. Thanks to the new deep, proxy-based reactivity system,
you can modify state with plain JavaScript assignments. It's as simple as it gets:

```javascript readonly
// Get the provider and change the data directly
const provider = myComponent.getStateProvider();

// This one line is all it takes to trigger a reactive update.
provider.data.user.firstname = 'Max';

// Does not overwrite the lastname
provider.setData({user: {firstname: 'Robert'}})

// You can update multiple properties at once. Thanks to automatic batching,
// this results in only a single UI update cycle.
provider.setData({user: {firstname: 'John', lastname: 'Doe'}})

// Alternative Syntax:
provider.setData({
    'user.firstname': 'John',
    'user.lastname' : 'Doe'
});
```

Let's see this in action. The following live example demonstrates how a component can bind to and modify state from a provider.

```javascript live-preview
import Button    from 'neo.mjs/src/button/Base.mjs';
import Container from 'neo.mjs/src/container/Base.mjs';
import Label     from 'neo.mjs/src/component/Label.mjs';

class MainView extends Container {
    static config = {
        className: 'My.StateProvider.Example1',
        stateProvider: {
            data: {
                user: {
                    firstName: 'Tobias',
                    lastName : 'Uhlig'
                }
            }
        },
        layout: {ntype: 'vbox', align: 'start'},
        items: [{
            module: Label,
            bind: {
                text: data => `User: ${data.user.firstName} ${data.user.lastName}`
            },
            style: {marginBottom: '10px'}
        }, {
            module: Button,
            text: 'Change First Name',
            handler() {
                // This performs a DEEP MERGE, not an overwrite.
                // The 'lastName' property will be preserved.
                this.setState({
                    user: { firstName: 'John' }
                });
            }
        }, {
            module: Button,
            text: 'Change Last Name (Path-based)',
            style: {marginTop: '10px'},
            handler() {
                // You can also set a value using its path.
                this.setState({'user.lastName': 'Doe'});
            }
        }]
    }
}
MainView = Neo.setupClass(MainView);
```
Notice the "Change First Name" button. It calls `setState` with an object that only contains `firstName`. The v10 provider
is smart enough to perform a deep merge, updating `firstName` while leaving `lastName` untouched. This prevents accidental
data loss and makes state updates safe and predictable by default.

### 3. The Power of Formulas: Derived State Made Easy

Because the provider is built on `Neo.core.Effect`, creating computed properties ("formulas") is a native, first-class
feature. You define them in a separate `formulas` config, and the provider automatically keeps them updated.

```javascript live-preview
import Container from 'neo.mjs/src/container/Base.mjs';
import Label from 'neo.mjs/src/component/Label.mjs';
import TextField from 'neo.mjs/src/form/field/Text.mjs';

class MainView extends Container {
    static config = {
        className: 'My.StateProvider.Example2',
        layout: {ntype: 'vbox', align: 'stretch'},
        stateProvider: {
            data: {
                user: {
                    firstName: 'Tobias',
                    lastName : 'Uhlig'
                }
            },
            formulas: {
                fullName: data => `${data.user.firstName} ${data.user.lastName}`
            }
        },
        items: [{
            module: Label,
            bind: { text: data => `Welcome, ${data.fullName}!` },
            style: {marginBottom: '10px'}
        }, {
            module: TextField,
            labelText: 'First Name',
            bind: { value: data => data.user.firstName },
            listeners: {
                change: function({value}) { this.setState({'user.firstName': value}) }
            }
        }, {
            module: TextField,
            labelText: 'Last Name',
            bind: { value: data => data.user.lastName },
            listeners: {
                change: function({value}) { this.setState({'user.lastName': value}) }
            }
        }]
    }
}
MainView = Neo.setupClass(MainView);
```
When you edit the text fields, the `setState` call updates the base `user` data. The `Effect` system detects this,
automatically re-runs the `fullName` formula, and updates the welcome label.

### 4. Formulas Across Hierarchies

The true power of the hierarchical system is revealed when formulas in a child provider can seamlessly use data from a
parent. This allows you to create powerful, scoped calculations that still react to global application state.

```javascript live-preview
import Button    from 'neo.mjs/src/button/Base.mjs';
import Container from 'neo.mjs/src/container/Base.mjs';
import Label     from 'neo.mjs/src/component/Label.mjs';

class MainView extends Container {
    static config = {
        className: 'My.StateProvider.Example4',
        layout: {ntype: 'vbox', align: 'stretch', padding: '10px'},
        // 1. Parent provider with a global tax rate
        stateProvider: {
            data: {
                taxRate: 0.19
            }
        },
        items: [{
            module: Label,
            bind: { text: data => `Global Tax Rate: ${data.taxRate * 100}%` }
        }, {
            module: Button,
            text: 'Change Tax Rate',
            handler() {
                this.setState({taxRate: Math.random().toFixed(2)});
            },
            style: {marginBottom: '10px'}
        }, {
            module: Container,
            // 2. Child provider with a local price
            stateProvider: {
                data: {
                    price: 100
                },
                formulas: {
                    // 3. This formula uses data from BOTH providers
                    totalPrice: data => data.price * (1 + data.taxRate)
                }
            },
            style: {padding: '10px'},
            layout: {ntype: 'vbox', align: 'start'},
            items: [{
                module: Label,
                bind: { text: data => `Local Price: €${data.price.toFixed(2)}` }
            }, {
                module: Label,
                bind: { text: data => `Total (inc. Tax): €${data.totalPrice.toFixed(2)}` },
                style: {fontWeight: 'bold', marginTop: '10px'}
            }, {
                module: Button,
                text: 'Change Price',
                handler() {
                    this.setState({price: Math.floor(Math.random() * 100) + 50});
                },
                style: {marginTop: '10px'}
            }]
        }]
    }
}
MainView = Neo.setupClass(MainView);
```
In this example, the child provider's `totalPrice` formula depends on its own local `price` and the parent's `taxRate`.
Clicking either button triggers the correct reactive update, and the total price is always in sync. This demonstrates
the effortless composition of state across different parts of your application.

### 5. Hierarchical by Design: Nested Providers That Just Work

The v10 provider was engineered to handle different scopes of state with an intelligent hierarchical model. A child
component can seamlessly access data from its own provider as well as any parent provider.

```javascript live-preview
import Container from 'neo.mjs/src/container/Base.mjs';
import Label from 'neo.mjs/src/component/Label.mjs';

class MainView extends Container {
    static config = {
        className: 'My.StateProvider.Example3',
        stateProvider: {
            data: { theme: 'dark' }
        },
        layout: {ntype: 'vbox', align: 'stretch', padding: '10px'},
        items: [{
            module: Label,
            bind: { text: data => `Global Theme: ${data.theme}` }
        }, {
            module: Container,
            stateProvider: {
                data: { user: 'Alice' }
            },
            style: {padding: '10px', marginTop: '10px'},
            items: [{
                module: Label,
                bind: {
                    text: data => `Local User: ${data.user} (Theme: ${data.theme})`
                }
            }]
        }]
    }
}
MainView = Neo.setupClass(MainView);
```
The nested component can access both `user` from its local provider and `theme` from the parent provider without any
extra configuration.

### 5. The Final Piece: State Providers in Functional Components

Thanks to the v10 refactoring, state providers are now a first-class citizen in functional components. You can define a
provider and bind to its data with the same power and simplicity as in class-based components.

```javascript live-preview
import {defineComponent} from 'neo.mjs';
import Label from 'neo.mjs/src/component/Label.mjs';
import TextField from 'neo.mjs/src/form/field/Text.mjs';

export default defineComponent({
    stateProvider: {
        data: {
            user: {
                firstName: 'Jane',
                lastName : 'Doe'
            }
        },
        formulas: {
            fullName: data => `${data.user.firstName} ${data.user.lastName}`
        }
    },
    createVdom(config) {
        return {
            layout: {ntype: 'vbox', align: 'stretch'},
            items: [{
                module: Label,
                bind: { text: data => `Welcome, ${config.data.fullName}!` },
                style: {marginBottom: '10px'}
            }, {
                module: TextField,
                labelText: 'First Name',
                bind: { value: data => config.data.user.firstName },
                listeners: {
                    change: ({value}) => config.setState({'user.firstName': value})
                }
            }, {
                module: TextField,
                labelText: 'Last Name',
                bind: { value: data => config.data.user.lastName },
                listeners: {
                    change: ({value}) => config.setState({'user.lastName': value})
                }
            }]
        }
    }
});
```
This example demonstrates the full power of the new architecture: a functional component with its own reactive data,
computed properties, and two-way bindings, all with clean, declarative code.

### 6. From Theory to Practice: The Comprehensive Guide

The examples above show the clean, intuitive API. For a complete, hands-on exploration with dozens of live-preview
examples covering everything from nested providers and formulas to advanced store management, we encourage you to
explore our comprehensive guide. The rest of this article will focus on the deep architectural advantages that make
this system possible.

**[Read the Full State Providers Guide Here](../guides/datahandling/StateProviders.md)**

### 7. Under the Hood Part 1: The Proxy's Magic

The beautiful API above is powered by a sophisticated proxy created by `Neo.state.createHierarchicalDataProxy`.
When you interact with `provider.data`, you're not touching a plain object; you're interacting with an intelligent agent
that works with Neo's `EffectManager`.

You can see the full implementation in
**[src/state/createHierarchicalDataProxy.mjs](../../src/state/createHierarchicalDataProxy.mjs)**.

Here’s how it works:

1.  **The `get` Trap:** When your binding function (`data => data.user.firstname`) runs for the first time, it accesses
    properties on the proxy. The proxy's `get` trap intercepts these reads and tells the `EffectManager`,
    "The currently running effect depends on the `user.firstname` config." This builds a dependency graph automatically.
2.  **The `set` Trap:** When you write `provider.data.user.firstname = 'Max'`, the proxy's `set` trap intercepts the
    assignment. It then calls the provider's internal `setData('user.firstname', 'Max')` method, which triggers the
    reactivity system to re-run only the effects that depend on that specific property.

This proxy is the bridge between a simple developer experience and a powerful, fine-grained reactive engine.

### 8. Under the Hood Part 2: The "Reactivity Bubbling" Killer Feature

This is where the Neo.mjs `state.Provider` truly shines and solves the "Context Tax." Consider this critical question:

> "What happens if a component is bound to the entire `data.user` object, and we only change `data.user.name`?"

In many systems, this would not trigger an update, because the reference to the `user` object itself hasn't changed.
This is a common "gotcha" that forces developers into complex workarounds.

Neo.mjs handles this intuitively with a feature we call **"reactivity bubbling."** A change to a leaf property is
correctly perceived as a change to its parent.

We don't just claim this works; we prove it. Our test suite for this exact behavior,
**[test/siesta/tests/state/ProviderNestedDataConfigs.mjs](../../test/siesta/tests/state/ProviderNestedDataConfigs.mjs)**,
demonstrates this with concrete assertions.

Here’s a simplified version of the test:

```javascript
// From test/siesta/tests/state/ProviderNestedDataConfigs.mjs
t.it('State Provider should trigger parent effects when a leaf node changes (bubbling)', t => {
    let effectRunCount = 0;

    const component = Neo.create(MockComponent, {
        stateProvider: { data: { user: { name: 'John', age: 30 } } }
    });
    const provider = component.getStateProvider();

    // This binding depends on the 'user' object itself.
    provider.createBinding(component.id, 'user', data => {
        effectRunCount++;
        return data.user;
    });

    t.is(effectRunCount, 1, 'Effect should run once initially');

    // Change a leaf property.
    provider.setData('user.age', 31);

    // Assert that the effect depending on the PARENT object re-ran.
    t.is(effectRunCount, 2, 'Effect should re-run after changing a leaf property');
});
```
This behavior is made possible by the `internalSetData` method in **[state/Provider.mjs](../../src/state/Provider.mjs)**.
When you set `'user.age'`, the provider doesn't just update that one value. It then "bubbles up," creating a new `user`
object reference that incorporates the change: `{...oldUser, age: 31}`. This new object reference is what the reactivity
system detects, ensuring that any component bound to `user` updates correctly.

### Conclusion: Reactivity at the Core

The new `state.Provider` is more than just a state management tool; it's a direct expression of the framework's core
philosophy. By building on a foundation of true, fine-grained reactivity, it delivers a system that is:

*   **Intuitive:** Write state changes like plain JavaScript. The API is clean, direct, and free of boilerplate.
*   **Surgically Performant:** Only components that depend on the *exact* data that changed will update. The "Context Tax"
    is eliminated by default.
*   **Predictable & Robust:** With features like "reactivity bubbling," the system behaves exactly as a developer would
    expect, removing hidden gotchas and making state management a reliable and enjoyable process.

This is what a ground-up reactive system enables, and it's a cornerstone of the developer experience in Neo.mjs v10.

---

## The Neo.mjs v10 Blog Post Series

1. [A Frontend Love Story: Why the Strategies of Today Won't Build the Apps of Tomorrow](./v10-post1-love-story.md)
2. [Deep Dive: Named vs. Anonymous State - A New Era of Component Reactivity](./v10-deep-dive-reactivity.md)
3. [Beyond Hooks: A New Breed of Functional Components for a Multi-Threaded World](./v10-deep-dive-functional-components.md)
4. [Deep Dive: The VDOM Revolution - JSON Blueprints & Asymmetric Rendering](./v10-deep-dive-vdom-revolution.md)
5. Deep Dive: The State Provider Revolution
