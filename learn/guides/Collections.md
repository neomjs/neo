
Neo.mjs provides a powerful and flexible `Neo.collection.Base` class for managing data. This guide will explore its
features, including:

-   **Core Concepts**: Understanding how collections store and manage data.
-   **Adding and Removing Items**: Methods like `add`, `remove`, `insert`, `pop`, `push`, `shift`, and `unshift`.
-   **Filtering Data**: Using `Neo.collection.Filter` to filter collection items.
-   **Sorting Data**: Using `Neo.collection.Sorter` to sort collection items.
-   **Event Handling**: How collections emit events on data mutations.
-   **Performance Considerations**: Tips for optimizing collection usage.

## Core Concepts

The `Neo.collection.Base` class is the foundation for all collections in Neo.mjs. While a standard JavaScript array can
store data, it lacks the advanced features required for complex application development, such as automatic sorting,
filtering, efficient key-based lookups, and robust eventing. `Neo.collection.Base` addresses these needs by combining
an array with a Map, offering a powerful and performant data management solution.

Key characteristics include:

-   **`items_` (Array)**: This private array holds the actual data items within the collection. While these can be any
  JavaScript object, in many real-world Neo.mjs applications, especially when working with `Neo.data.Store`, these items
  are `Record` instances (super lightweight object extensions). It provides ordered access to items, which is essential for
  operations like iteration and maintaining insertion order (unless sorting is applied).
-   **`map_` (Map)**: A `Map` object that stores a key-value pair for each collection item. The key is derived from the
  `keyProperty` of each item, and the value is a reference to the item itself. This `Map` is crucial for enabling extremely
  fast lookups.

### Why the Array + Map Combination?

This dual-structure approach provides the best of both worlds:

-   **Ordered Access & Iteration (Array)**: The internal `items_` array allows for straightforward iteration over the
  collection in a defined order (either insertion order or sorted order). Accessing an item by its index is an O(1)
  (constant time) operation.
-   **Efficient Key-Based Lookups (Map)**: The `map_` enables direct, constant-time (O(1)) retrieval of items by their
  unique `keyProperty`. This is a significant performance advantage over searching a plain array, which would require
  iterating through items until a match is found, resulting in an an O(n) (linear time) operation in the worst case.

**Performance Impact (Big O Notation):**

Consider a collection with 100,000 items:

-   **Getting an item by ID (`collection.get(id)`)**: Thanks to the `map_`, this operation takes approximately the same
  amount of time regardless of whether the collection has 10 items or 100,000 items. This is an O(1) operation.
-   **Searching a plain array for an item by ID**: In the worst case (item is at the end or not present), you would have
  to check every single item. For 100,000 items, this could mean 100,000 comparisons. This is an O(n) operation.

This fundamental difference in lookup efficiency is a primary reason for the `Neo.collection.Base` design, ensuring high
performance even with very large datasets.

-   **`keyProperty`**: By default, this is set to `'id'`, meaning each item in the collection should have a unique `id`
  property. This is crucial for the `map_` to function correctly.
-   **`autoSort`**: If set to `true`, the collection will automatically sort its items when new ones are added or
  inserted, based on the configured sorters.
-   **`sourceId_`**: Collections can be linked to a source collection. This is a powerful feature where a collection
  automatically mirrors the data mutations (additions, removals, reordering) of another collection. This is particularly
  useful for creating filtered or sorted views of a larger dataset without duplicating the data.

### The `sourceId` Concept and Real-World Use Cases

The `sourceId` configuration allows you to create "derived" or "linked" collections that automatically stay in sync with
a "source" collection. This is achieved by the dependent collection listening to the `mutate` event of its source. Any
changes to the source collection's items are automatically propagated to the dependent collection.

**Real-World Use Cases:**

1.  **Source-Detail Views:** Display a source list (source collection) and a filtered or sorted subset of that data in
  a detail view (dependent collection). Changes in the source list automatically update the detail view.
2.  **Multiple Synchronized Components:** On a dashboard, multiple widgets might display different views (filtered,
  sorted, or transformed) of the same underlying dataset. A central source collection ensures all widgets remain consistent.
3.  **Data Transformation Pipelines:** Chain collections together, where the output of one collection (as a source)
  becomes the input for the next, allowing for complex data processing flows.

This mechanism significantly reduces boilerplate code for data synchronization and ensures data consistency across your
application.

**Advanced Use Case: Grid and ComboBox with Shared Data**

Consider a scenario where you have a large dataset (e.g., a list of products) that needs to be displayed in a grid, and
a subset of that data needs to be available in a combobox picker list.

If you were to use a single collection for both, typing into the combobox's input field to filter its options would
inadvertently filter the data displayed in your grid, which is typically not the desired behavior.

The `sourceId` concept provides an elegant solution:

1.  **Primary Store (Collection)**: Create a primary `Neo.collection.Base` instance (acting as your data store) that
  fetches the complete product list from a backend. This collection is not directly bound to any UI component.
2.  **Grid Store (Child Collection)**: Create a second `Neo.collection.Base` instance for your grid. Set its `sourceId`
  to the ID of your primary store. This grid store will automatically receive all data and mutations from the primary.
  It can then apply its own sorting or filtering (e.g., to display only "in-stock" items) without affecting the primary
  or other child collections.
3.  **ComboBox Store (Child Collection)**: Create a third `Neo.collection.Base` instance for your combobox's picker list.
  Set its `sourceId` to the ID of your primary store. This combobox store can then apply its own filters (e.g., based on
  user input in the combobox field) and sorters, completely independently of the grid store or the primary store.

```javascript
import Collection from '../../src/collection/Base.mjs';
import Filter     from '../../src/collection/Filter.mjs';

// 1. Primary Store: Fetches data from backend (simulated)
const primaryProductsStore = Neo.create(Collection, {
    id: 'primaryProductsStore',
    items: [
        {id: 1, name: 'Laptop',     category: 'Electronics', price: 1200, inStock: true},
        {id: 2, name: 'Mouse',      category: 'Electronics', price:   25, inStock: true},
        {id: 3, name: 'Keyboard',   category: 'Electronics', price:   75, inStock: false},
        {id: 4, name: 'Monitor',    category: 'Electronics', price:  300, inStock: true},
        {id: 5, name: 'Desk Chair', category: 'Furniture',   price:  150, inStock: true},
        {id: 6, name: 'Webcam',     category: 'Electronics', price:   50, inStock: false}
    ]
});

// 2. Grid Store: Displays all in-stock electronics, sorted by price
const gridStore = Neo.create(Collection, {
    id      : 'gridStore',
    sourceId: 'primaryProductsStore', // Linked to primary
    filters: [
        {property: 'inStock',  value: true},
        {property: 'category', value: 'Electronics'}
    ],
    sorters: [
        {property: 'price', direction: 'ASC'}
    ]
});

// 3. ComboBox Store: Filters based on user input (e.g., 'web')
const comboBoxStore = Neo.create(Collection, {
    id      : 'comboBoxStore',
    sourceId: 'primaryProductsStore', // Linked to primary
    filters: [
        // This filter would be dynamically updated by the combobox input
        {property: 'name', operator: 'like', value: 'web'}
    ]
});

console.log('Primary Store Count:', primaryProductsStore.getCount()); // Output: 6
console.log('Grid Store Count (in-stock electronics):', gridStore.getCount()); // Output: 3 (Laptop, Mouse, Monitor)
console.log('ComboBox Store Count (name like "web"):', comboBoxStore.getCount()); // Output: 1 (Webcam)

// Simulate adding a new product to the primary store
primaryProductsStore.add({id: 7, name: 'Headphones', category: 'Electronics', price: 100, inStock: true});

console.log('Primary Store Count after add:', primaryProductsStore.getCount()); // Output: 7
console.log('Grid Store Count after add (Headphones match filters):', gridStore.getCount()); // Output: 4
console.log('ComboBox Store Count after add (Headphones do not match "web")):', comboBoxStore.getCount()); // Output: 1

// Simulate changing the combobox filter
comboBoxStore.filters[0].value = 'key';
console.log('ComboBox Store Count (name like "key"):', comboBoxStore.getCount()); // Output: 1 (Keyboard)
console.log('Grid Store Count (still unaffected):', gridStore.getCount()); // Output: 4
```

This example demonstrates how `sourceId` enables powerful data management patterns, allowing different parts of your
application to work with synchronized data while maintaining their own independent views.


-   **`observable`**: Collections are observable, meaning they can emit events when their data changes (e.g., `mutate`,
- `filter`, `sort`).

### Example: Basic Collection Usage

```javascript
import Collection from '../../src/collection/Base.mjs';

const myCollection = Neo.create(Collection, {
    items: [
        {id: 1, name: 'Alice',   age: 30},
        {id: 2, name: 'Bob',     age: 24},
        {id: 3, name: 'Charlie', age: 35}
    ]
});

console.log(myCollection.getCount()); // Output: 3
console.log(myCollection.get(2));    // Output: {id: 2, name: 'Bob', age: 24}
```

## Adding and Removing Items

Collections provide several methods for manipulating their contents. When adding raw data (plain JavaScript objects) to
a `Neo.data.Store` (which extends `Neo.collection.Base`), these objects are automatically converted into Record
instances based on the store's model definition.

-   **`add(item)`**: Adds one or more items (or Records) to the end of the collection.
-   **`insert(index, item)`**: Inserts one or more items at a specific index.
-   **`remove(key)`**: Removes an item by its key or the item itself.
-   **`removeAt(index)`**: Removes an item at a specific index.
-   **`pop()`**: Removes and returns the last item from the collection.
-   **`push(item)`**: Adds one or more items to the end of the collection (alias for `add`).
-   **`shift()`**: Removes and returns the first item from the collection.
-   **`unshift(item)`**: Adds one or more items to the beginning of the collection.
-   **`splice(index, removeCountOrToRemoveArray, toAddArray)`**: This is the **central and most powerful method** for
  modifying a collection. It can simultaneously remove and add items at a specified index. Many other collection methods,
  such as `add()`, `remove()`, `insert()`, `pop()`, `push()`, `shift()`, and `unshift()`, internally use `splice()` to
  perform their operations, making it the core mechanism for all data mutations within a collection.
-   **`clear()`**: Removes all items from the collection.

### Example: Adding and Removing

```javascript
import Collection from '../../src/collection/Base.mjs';

const users = Neo.create(Collection, {
    items: [
        {id: 1, name: 'Alice'},
        {id: 2, name: 'Bob'}
    ]
});

users.add({id: 3, name: 'Charlie'});
console.log(users.getCount()); // Output: 3

users.insert(1, {id: 4, name: 'David'});
console.log(users.getAt(1)); // Output: {id: 4, name: 'David'}

users.remove(2); // Removes Bob
console.log(users.findFirst('name', 'Bob')); // Output: null

users.pop(); // Removes Charlie
console.log(users.getCount()); // Output: 2

users.clear();
console.log(users.getCount()); // Output: 0
```

## Filtering Data

`Neo.collection.Filter` instances are used to filter the items within a collection.

-   **`property`**: The property of the item to filter by.
-   **`operator`**: The comparison operator (e.g., `'===', '>', 'like', 'startsWith'`).
-   **`value`**: The value to compare against.
-   **`filterBy`**: A custom function for more complex filtering logic.
-   **`disabled`**: Temporarily disable a filter.

The `Neo.collection.Base` class has a `filters_` config which accepts an array of `Filter` instances or configurations.

### The `allItems` Property

When a collection is filtered, the original, unfiltered set of items is preserved in the `allItems` property. This is a
significant advantage over simply filtering a JavaScript array, as it allows you to easily revert to the full dataset or
perform operations on it without losing the original data.

### Reactivity of Filters

Each `Neo.collection.Filter` is a Neo instance, and its configuration properties are reactive. This means that changes
to the `filters` array or to properties of individual `Filter` instances within the array will automatically trigger a
re-filter of the collection. **It's important to note that simply mutating the `filters` array (e.g., using `push()`,
`pop()`, `splice()`) will not trigger reactivity. For changes to the array's contents to take effect, you must reassign
the `filters` property (e.g., `collection.filters = [...collection.filters];`) or modify properties of existing filter
instances.**

### Example: Filtering a Collection

```javascript
import Collection from '../../src/collection/Base.mjs';
import Filter     from '../../src/collection/Filter.mjs';

const products = Neo.create(Collection, {
    items: [
        {id: 1, name: 'Laptop',   price: 1200},
        {id: 2, name: 'Mouse',    price:   25},
        {id: 3, name: 'Keyboard', price:   75},
        {id: 4, name: 'Monitor',  price:  300}
    ]
});

// Filter products with price > 100
products.filters = [{
    property: 'price',
    operator: '>',
    value   : 100
}];

console.log(products.getCount());      // Output: 2 (Laptop, Monitor)
console.log(products.allItems.getCount()); // Output: 4 (all original items)

// Add another filter: name contains 'o'
products.filters.push({
    property: 'name',
    operator: 'like',
    value   : 'o'
});
// Reassign the filters array to trigger reactivity
products.filters = [...products.filters];

console.log(products.getCount()); // Output: 1 (Monitor)

// Dynamically disable the first filter
products.filters[0].disabled = true;
console.log(products.getCount()); // Output: 1 (Monitor - only the 'name like o' filter is active)

// Clear filters
products.clearFilters();
console.log(products.getCount()); // Output: 4

// Adding an item to a filtered collection
products.filters = [{ property: 'price', operator: '>', value: 500 }];
products.add({ id: 5, name: 'Webcam', price: 50 }); // Does not match filter
console.log(products.getCount()); // Output: 1 (Laptop)
console.log(products.allItems.getCount()); // Output: 5 (Webcam is in allItems)
```

## Sorting Data

`Neo.collection.Sorter` instances are used to sort the items within a collection.

-   **`property`**: The property of the item to sort by.
-   **`direction`**: The sort direction (`'ASC'` or `'DESC'`).
-   **`sortBy`**: A custom function for more complex sorting logic.

The `Neo.collection.Base` class has a `sorters_` config which accepts an array of `Sorter` instances or configurations.

### Reactivity of Sorters

Each `Neo.collection.Sorter` is a Neo instance, and its configuration properties are reactive. This means that changes
to the `sorters` array or to properties of individual `Sorter` instances within the array will automatically trigger a
re-sort of the collection. **It's important to note that simply mutating the `sorters` array (e.g., using `push()`,
`pop()`, `splice()`) will not trigger reactivity. For changes to the array's contents to take effect, you must reassign
the `sorters` property (e.g., `collection.sorters = [...collection.sorters];`) or modify properties of existing sorter
instances.**

### Example: Sorting a Collection

```javascript
import Collection from '../../src/collection/Base.mjs';
import Sorter     from '../../src/collection/Sorter.mjs';

const employees = Neo.create(Collection, {
    items: [
        {id: 1, name: 'Alice',   salary: 50000},
        {id: 2, name: 'Bob',     salary: 75000},
        {id: 3, name: 'Charlie', salary: 60000}
    ]
});

// Sort by salary descending
employees.sorters = [{
    property : 'salary',
    direction: 'DESC'
}];

console.log(employees.first().name); // Output: Bob

// Dynamically change the sort property
employees.sorters[0].property = 'name';
employees.sorters[0].direction = 'ASC';
console.log(employees.first().name); // Output: Alice

// Clear sorters and restore original order (if applicable)
employees.clearSorters(true);
console.log(employees.first().name); // Output: Alice (assuming original order was by id)
```

## Event Handling

Collections are observable and emit events when their state changes. The primary event is `mutate`, which fires after
any operation that changes the collection's items.

-   **`mutate`**: Fired after items are added, removed, or reordered. Provides `addedItems` and `removedItems` arrays.
-   **`filter`**: Fired after the collection is filtered.
-   **`sort`**: Fired after the collection is sorted.

### Example: Listening to Collection Events

```javascript
import Collection from '../../src/collection/Base.mjs';

const tasks = Neo.create(Collection, {
    items: [
        {id: 1, description: 'Buy groceries'},
        {id: 2, description: 'Walk the dog'}
    ]
});

tasks.on('mutate', ({addedItems, removedItems}) => {
    if (addedItems.length > 0) {
        console.log('Added:', addedItems.map(item => item.description));
    }
    if (removedItems.length > 0) {
        console.log('Removed:', removedItems.map(item => item.description));
    }
});

tasks.add({id: 3, description: 'Clean the house'});
// Output: Added: ["Clean the house"]

tasks.remove(1);
// Output: Removed: ["Buy groceries"]
```

## Performance Considerations

-   **`startUpdate()` and `endUpdate()`**: For bulk operations (multiple additions, removals, or modifications), wrap
  your changes within `startUpdate()` and `endUpdate()`. This prevents multiple `mutate` events from firing, improving performance.
-   **`silentUpdateMode`**: When using `startUpdate(true)`, the `mutate` event will not fire at all when `endUpdate(true)`
  is called. This is useful when you want to perform internal updates without notifying listeners.
-   **`filterMode`**: The `filterMode` config can be set to `'primitive'` or `'advanced'`. `'primitive'` is generally
  faster for simple filters, while `'advanced'` is needed for filters that depend on other collection items.
-   **`keyProperty`**: Ensure your `keyProperty` is truly unique for each item to leverage the `map_` for efficient lookups.

## Cloning Collections

When you clone a collection using `collection.clone()`, a new collection instance is created with a shallow copy of the
*current items*. However, the filters and sorters of the cloned collection are based on the *original configuration* of
the source collection, not its currently active filters or sorters. This means if the original collection had filters or
sorters applied after its initial creation, the cloned collection will not inherit those dynamic changes unless explicitly
reapplied.

## Collections and Records: A Powerful Combination

While `Neo.collection.Base` is designed to manage any type of JavaScript object, its full potential within the Neo.mjs
framework is often realized when combined with `Neo.data.Model` instances (Records) through `Neo.data.Store`.
`Neo.data.Store` extends `Neo.collection.Base`, specializing it for the management of structured, reactive data.

When a `Neo.data.Store` holds `Records`:

-   **Automatic Record Conversion**: Raw data (plain JavaScript objects) added to a `Store` are automatically converted
  into reactive `Record` instances based on the `Store`'s associated `Neo.data.Model`.
-   **Dual-Layered Reactivity**: You gain both collection-level reactivity (for structural changes like adding/removing
  records) and record-level reactivity (for changes to individual record fields). This enables highly optimized UI
  updates, as components can react precisely to the specific data changes that affect them.
-   **Enhanced Data Management**: Records bring features like type conversion, validation, and dirty tracking to the
  items within the collection, providing a more robust data management solution.

This powerful combination forms the backbone of data-driven components like Grids, ComboBoxes, and other data-bound UI
elements in Neo.mjs.

## Conclusion

Neo.mjs Collections provide a robust, high-performance, and flexible solution for managing data within your applications.
By combining the ordered access of arrays with the efficient key-based lookups of Maps, and offering powerful features
like reactive filtering, sorting, and `sourceId` linking, they significantly simplify complex data management tasks.
Understanding these core concepts and leveraging the provided methods will enable you to build highly responsive and
data-driven Neo.mjs applications with ease.
