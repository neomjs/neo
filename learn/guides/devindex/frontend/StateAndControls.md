# State Management & Component Controllers

The DevIndex application is not just a static table; it is a highly interactive "Fat Client" dashboard managing 50,000+ complex records. Users can dynamically filter by country, search by name, toggle metrics, and adjust render settings on the fly.

Wiring a complex control panel (`ControlsContainer`) directly to a massive data grid (`GridContainer`) using standard DOM event listeners would quickly result in spaghetti code and tightly coupled components. 

To solve this, the DevIndex application relies heavily on the **Neo.mjs MVC/MVVM architecture**: `StateProviders` (for declarative data binding) and `Controllers` (for localized business logic). 

Crucially, **all of this logic executes within the App Worker**, meaning even complex state recalculations across 50,000 records will never freeze the browser's Main Thread.

---

## The Orchestrator: MainContainer

The central hub for the DevIndex "Home" view is `apps/devindex/view/home/MainContainer.mjs`. It doesn't contain much UI itself; instead, it orchestrates the layout and injects the MVVM foundation for its children.

```javascript readonly
// apps/devindex/view/home/MainContainer.mjs
class MainContainer extends Container {
    static config = {
        controller   : Controller,                 // Injects MainContainerController
        stateProvider: MainContainerStateProvider, // Injects MainContainerStateProvider
        
        items: [{
            // ... GridWrapper
            items: [{
                module   : GridContainer,
                bind     : {store: 'stores.contributors'}, // Data binding
                reference: 'grid'                          // Lookup reference
            }, {
                module   : StatusToolbar,
                bind     : {store: 'stores.contributors'}  // Data binding
            }]
        }, {
            module   : ControlsContainer,
            reference: 'controls'                          // Lookup reference
        }]
    }
}
```

Notice the use of `reference`. Instead of relying on rigid DOM hierarchies or component IDs, children are assigned logical references (e.g., `'grid'`). The Controller uses these references to safely query the component tree.

---

## The Data Hub: StateProviders

Neo.mjs uses a hierarchical state management system. A `StateProvider` attached to a container makes its data available to all descendant components.

### 1. The Local State (MainContainerStateProvider)

The DevIndex doesn't instantiate its 50k-row data store globally or directly inside the Grid. Instead, the store is defined declaratively inside the `MainContainerStateProvider`:

```javascript readonly
// apps/devindex/view/home/MainContainerStateProvider.mjs
class MainContainerStateProvider extends StateProvider {
    static config = {
        stores: {
            contributors: {
                module: Contributors // The 50k-row Store
            }
        }
    }
}
```

Because the store lives in the State Provider, multiple independent components can bind to it simultaneously without needing to know about each other. As seen in the `MainContainer` snippet above, both the `GridContainer` and the `StatusToolbar` use `bind: {store: 'stores.contributors'}` to share the exact same dataset instance.

### 2. The Global State (ViewportStateProvider)

The application also has a top-level `ViewportStateProvider` that manages global UI state.

```javascript readonly
// apps/devindex/view/ViewportStateProvider.mjs
class ViewportStateProvider extends StateProvider {
    static config = {
        data: {
            animateVisuals: true,
            isScrolling   : false
        }
    }
}
```

This is incredibly powerful for performance optimization. For instance, the `GridContainer` binds to this global state to disable heavy sparkline animations while the user is actively scrolling:

```javascript readonly
// GridContainer.mjs
bind: {
    animateVisuals: data => data.animateVisuals
}
```

---

## Business Logic: The Component Controller

The `ControlsContainer` is full of checkboxes, text fields, and combo boxes. When a user interacts with them, the components themselves don't know *what* to do with the data; they just fire events.

The `MainContainerController` (`apps/devindex/view/home/MainContainerController.mjs`) catches these events, queries other components using `getReference()`, and mutates the state or the store.

### Handling Interactive Filtering

When a user types into the "Bio Search" text field, the field fires a `change` event routed to `onFilterChange`.

```javascript readonly
// apps/devindex/view/home/MainContainerController.mjs
onFilterChange(data) {
    let grid  = this.getReference('grid'),
        value = data.component.getSubmitValue();

    if (data.component.name === 'countryCode' && value) {
        value = value.toUpperCase();
    }

    // Mutate the bound store's filter
    grid.store.getFilter(data.component.name).value = value;
}
```

The Controller finds the Grid, accesses the shared `Contributors` store, and updates the specific filter object matching the component's name.

Because the Store is reactive, mutating the filter immediately triggers a "Soft Hydration" loop (as described in the Backend guide) where the App Worker iterates over all 50,000 raw objects in memory, applies the filter, and commands the Virtual DOM worker to render the new subset.

### Managing Global State from Local Events

When the user scrolls the grid rapidly, we want to pause heavy operations. The grid fires an `isScrollingChange` event, caught by the Controller:

```javascript readonly
onGridIsScrollingChange(data) {
    // Updates the global ViewportStateProvider
    this.setState('isScrolling', data.value);
}
```

This single line of code updates the global state, which automatically cascades down to any component bound to `isScrolling` across the entire application, instantly optimizing rendering.

---

## Summary

The DevIndex leverages Neo.mjs MVVM patterns to keep its architecture clean while handling massive datasets:
1. **State Providers** act as declarative data hubs, allowing sibling components (like the Grid and the Statusbar) to share stores and global UI flags effortlessly.
2. **Component Controllers** act as the nerve center, decoupling UI events (from the Controls) from the data mutations (on the Store).
3. **App Worker Execution** guarantees that the complex logic required to filter, coordinate, and dispatch updates across 50,000 records never touches the browser's Main Thread.