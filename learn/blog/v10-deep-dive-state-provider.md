# Designing a State Manager for Performance: A Deep Dive into Hierarchical Reactivity

***A look at a new architecture that makes UI state management fast by default.***

Every application developer knows the pain of state management. You have a piece of state—a user object, a theme setting—that needs to be accessed by a component buried deep within your UI tree. The traditional approach is "prop-drilling": passing that data down through every single intermediate component. It's tedious, error-prone, and creates a tight coupling between components that shouldn't know about each other.

Modern frameworks solve this with a "Context API," a central provider that makes state available to any descendant. While this solves prop-drilling, it often introduces a hidden performance penalty. In many implementations, when *any* value in the context changes, *all* components consuming that context are forced to re-render, even if they don't care about the specific piece of data that changed.

But what if this performance tax isn't an inevitability, but a symptom of a deeper architectural choice? What if the entire problem could be sidestepped by moving state management off the main thread?

This is the fundamental principle behind the Neo.mjs **platform**. Before we continue, there is one architectural fact you must understand, as it is the origin of all the behavior described below:

**In Neo.mjs, State Providers (including all their reactive data and formulas) live and execute exclusively inside a Web Worker.**

This is possible because Neo.mjs provides a holistic, multi-threaded runtime model out of the box. The State Provider is a core capability of this platform—not simply a store you bolt on. It’s how we can deliver the convenience of a context API without the performance tax.

This is the story of how we built a state provider from the ground up to solve this problem, delivering a system that is intuitive, powerful, and surgically performant.

*(Part 5 of 5 in the v10 blog series. Details at the bottom.)*

### The Evolution: From Custom Parsing to a Universal Foundation

Neo.mjs has had a state provider for a long time, and it was already reactive. So, what’s the big deal with the v10 version? The difference lies in the *foundation*.

The previous state provider was a clever, custom-built system. It worked by parsing your binding functions with regular expressions to figure out which `data` properties you were using. This was effective, but had two major limitations:

1.  **It Only Worked for `data`:** You could only bind to properties inside the provider's `data` object. Binding to an external store's `count` or another component's `width` was simply not possible.
2.  **It Was Brittle:** Relying on regex parsing meant that complex or unconventionally formatted binding functions could sometimes fail to register dependencies correctly, leading to frustrating debugging sessions.

The v10 revolution was to throw out this custom parsing logic and rebuild the entire state management system on top of a universal, foundational concept: **`Neo.core.Effect`**.

This new foundation is what makes the modern `state.Provider` so powerful. It doesn't need to guess your dependencies; it *knows* them. When a binding function runs, `core.Effect` observes every reactive property you access—no matter where it lives—and builds a precise dependency graph in real-time.

The result is an API that is not only more powerful but also simpler and more intuitive, especially when it comes to changing state. The provider does what you would expect, automatically handling complex scenarios like deep merging.

Where the magic truly begins is in how you *change* that data. Thanks to the new deep, proxy-based reactivity system, you can modify state with plain JavaScript assignments. It's as simple as it gets:

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
Notice the "Change First Name" button. It calls `setState` with an object that only contains `firstName`. The v10 provider is smart enough to perform a deep merge, updating `firstName` while leaving `lastName` untouched. This prevents accidental data loss and makes state updates safe and predictable by default.

### The Power of Formulas: Derived State Made Easy

Because the provider is built on `Neo.core.Effect`, creating computed properties ("formulas") is a native, first-class feature. You define them in a separate `formulas` config, and the provider automatically keeps them updated.

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
When you edit the text fields, the `setState` call updates the base `user` data. The `Effect` system detects this, automatically re-runs the `fullName` formula, and updates the welcome label.

### Formulas Across Hierarchies

The true power of the hierarchical system is revealed when formulas in a child provider can seamlessly use data from a parent. This allows you to create powerful, scoped calculations that still react to global application state.

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
In this example, the child provider's `totalPrice` formula depends on its own local `price` and the parent's `taxRate`. Clicking either button triggers the correct reactive update, and the total price is always in sync. This demonstrates the effortless composition of state across different parts of your application.

### Hierarchical by Design: Nested Providers That Just Work

The v10 provider was engineered to handle different scopes of state with an intelligent hierarchical model. A child component can seamlessly access data from its own provider as well as any parent provider.

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
The nested component can access both `user` from its local provider and `theme` from the parent provider without any extra configuration.

### State Providers in Functional Components

Thanks to the v10 refactoring, state providers are now a first-class citizen in functional components. You can define a provider and bind to its data with the same power and simplicity as in class-based components.

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

### Under the Hood: The Proxy and "Reactivity Bubbling"

The beautiful API above is powered by a sophisticated proxy created by `Neo.state.createHierarchicalDataProxy`. When you
interact with `provider.data`, you're not touching a plain object; you're interacting with an intelligent agent that
works with Neo's `EffectManager`.

1.  **The `get` Trap:** When your binding function runs, the proxy's `get` trap intercepts these reads and tells the
    `EffectManager`, "The currently running effect depends on this property." This builds a dependency graph automatically.

This is the key to the 'zero-boilerplate' developer experience. Unlike other systems where you must manually declare dependencies and risk stale closures or infinite loops, Neo.mjs discovers them automatically just by observing what your code reads.
2.  **The `set` Trap:** When you write `provider.data.user.firstname = 'Max'`, the proxy's `set` trap intercepts the assignment.
    It then calls the provider's internal `setData()` method, which triggers the reactivity system to re-run only the
    effects that depend on that specific property.

This proxy is the bridge between a simple developer experience and a powerful, fine-grained reactive engine. It also
enables a key feature we call **"reactivity bubbling."** A change to a leaf property (e.g., `user.name`) is correctly
perceived as a change to its parent (`user`), ensuring that components bound to the parent object update as expected.

### Conclusion: Reactivity at the Core

The new `state.Provider` is more than just a state management tool; it's a direct expression of the framework's core philosophy. By building on a foundation of true, fine-grained reactivity, it delivers a system that is:

*   **Intuitive:** Write state changes like plain JavaScript. The API is clean, direct, and free of boilerplate.
*   **Surgically Performant:** Only components that depend on the *exact* data that changed will update. The "Context Tax" is eliminated by default.
*   **Predictable & Robust:** With features like "reactivity bubbling," the system behaves exactly as a developer would expect, removing hidden gotchas and making state management a reliable and enjoyable process.

This is the promise of the Neo.mjs platform: a high-performance architecture that results in a simpler, more productive, and more enjoyable developer experience. You spend your time building features, not fighting your tools.

**Seeing is Believing**

Reading about performance is one thing; seeing it is another. While the code snippets in this article are static, you can experience the real, interactive versions and get started with Neo.mjs in minutes.

1.  **Explore Interactive Examples:** See the code from this article and over 70 other examples running live in our Examples Portal. You can edit the code in your browser and see the results instantly.
    <br>
    **[=> Explore the Examples Portal](https://neomjs.com/dist/esm/apps/portal/#/examples)**

2.  **Create Your First App:** The `create-app` script is the fastest way to get a multi-threaded "Hello World" application running on your own machine.
    <br>
    `npx neo-app@latest`

---

## The Neo.mjs v10 Blog Post Series

1. [A Frontend Love Story: Why the Strategies of Today Won't Build the Apps of Tomorrow](./v10-post1-love-story.md)
2. [Deep Dive: Named vs. Anonymous State - A New Era of Component Reactivity](./v10-deep-dive-reactivity.md)
3. [Designing Functional Components for a Multi-Threaded World](./v10-deep-dive-functional-components.md)
4. [The VDOM Revolution: How We Render UIs from a Web Worker](./v10-deep-dive-vdom-revolution.md)
5. Designing a State Manager for Performance: A Deep Dive into Hierarchical Reactivity
