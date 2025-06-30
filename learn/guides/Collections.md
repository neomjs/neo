# Collections

Neo.mjs provides a powerful and flexible `Neo.collection.Base` class for managing data. This guide will explore its features, including:

-   **Core Concepts**: Understanding how collections store and manage data.
-   **Adding and Removing Items**: Methods like `add`, `remove`, `insert`, `pop`, `push`, `shift`, and `unshift`.
-   **Filtering Data**: Using `Neo.collection.Filter` to filter collection items.
-   **Sorting Data**: Using `Neo.collection.Sorter` to sort collection items.
-   **Event Handling**: How collections emit events on data mutations.
-   **Performance Considerations**: Tips for optimizing collection usage.

## Core Concepts

The `Neo.collection.Base` class is the foundation for all collections in Neo.mjs. It provides a robust way to manage ordered lists of data. Key characteristics include:

-   **`items_`**: This private array holds the actual data items within the collection.
-   **`map_`**: A `Map` object that stores a key-value pair for each item, allowing for fast lookups by a unique `keyProperty`.
-   **`keyProperty`**: By default, this is set to `'id'`, meaning each item in the collection should have a unique `id` property. This is crucial for the `map_` to function correctly.
-   **`autoSort`**: If set to `true`, the collection will automatically sort its items when new ones are added or inserted, based on the configured sorters.
-   **`sourceId_`**: Collections can be linked to a source collection. Changes in the source collection will be reflected in the dependent collection. This is particularly useful for creating filtered or sorted views of a larger dataset without duplicating the data.
-   **`observable`**: Collections are observable, meaning they can emit events when their data changes (e.g., `mutate`, `filter`, `sort`).

### Example: Basic Collection Usage

```javascript
import Collection from '../../src/collection/Base.mjs';

const myCollection = Neo.create(Collection, {
    items: [
        {id: 1, name: 'Alice', age: 30},
        {id: 2, name: 'Bob', age: 24},
        {id: 3, name: 'Charlie', age: 35}
    ]
});

console.log(myCollection.getCount()); // Output: 3
console.log(myCollection.get(2));    // Output: {id: 2, name: 'Bob', age: 24}
```

## Adding and Removing Items

Collections provide several methods for manipulating their contents:

-   **`add(item)`**: Adds one or more items to the end of the collection.
-   **`insert(index, item)`**: Inserts one or more items at a specific index.
-   **`remove(key)`**: Removes an item by its key or the item itself.
-   **`removeAt(index)`**: Removes an item at a specific index.
-   **`pop()`**: Removes and returns the last item from the collection.
-   **`push(item)`**: Adds one or more items to the end of the collection (alias for `add`).
-   **`shift()`**: Removes and returns the first item from the collection.
-   **`unshift(item)`**: Adds one or more items to the beginning of the collection.
-   **`splice(index, removeCountOrToRemoveArray, toAddArray)`**: This is the **central and most powerful method** for modifying a collection. It can simultaneously remove and add items at a specified index. Many other collection methods, such as `add()`, `remove()`, `insert()`, `pop()`, `push()`, `shift()`, and `unshift()`, internally use `splice()` to perform their operations, making it the core mechanism for all data mutations within a collection.
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

When a collection is filtered, the original, unfiltered set of items is preserved in the `allItems` property. This is a significant advantage over simply filtering a JavaScript array, as it allows you to easily revert to the full dataset or perform operations on it without losing the original data.

### Reactivity of Filters

Each `Neo.collection.Filter` is a Neo instance, and its configuration properties are reactive. This means that changes to the `filters` array or to properties of individual `Filter` instances within the array will automatically trigger a re-filter of the collection.

### Example: Filtering a Collection

```javascript
import Collection from '../../src/collection/Base.mjs';
import Filter     from '../../src/collection/Filter.mjs';

const products = Neo.create(Collection, {
    items: [
        {id: 1, name: 'Laptop', price: 1200},
        {id: 2, name: 'Mouse', price: 25},
        {id: 3, name: 'Keyboard', price: 75},
        {id: 4, name: 'Monitor', price: 300}
    ]
});

// Filter products with price > 100
products.filters = [{
    property: 'price',
    operator: '>',
    value: 100
}];

console.log(products.getCount());      // Output: 2 (Laptop, Monitor)
console.log(products.allItems.getCount()); // Output: 4 (all original items)

// Add another filter: name contains 'o'
products.filters.push({
    property: 'name',
    operator: 'like',
    value: 'o'
});

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

Each `Neo.collection.Sorter` is a Neo instance, and its configuration properties are reactive. This means that changes to the `sorters` array or to properties of individual `Sorter` instances within the array will automatically trigger a re-sort of the collection.

### Example: Sorting a Collection

```javascript
import Collection from '../../src/collection/Base.mjs';
import Sorter     from '../../src/collection/Sorter.mjs';

const employees = Neo.create(Collection, {
    items: [
        {id: 1, name: 'Alice', salary: 50000},
        {id: 2, name: 'Bob', salary: 75000},
        {id: 3, name: 'Charlie', salary: 60000}
    ]
});

// Sort by salary descending
employees.sorters = [{
    property: 'salary',
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

Collections are observable and emit events when their state changes. The primary event is `mutate`, which fires after any operation that changes the collection's items.

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

-   **`startUpdate()` and `endUpdate()`**: For bulk operations (multiple additions, removals, or modifications), wrap your changes within `startUpdate()` and `endUpdate()`. This prevents multiple `mutate` events from firing, improving performance.
-   **`silentUpdateMode`**: When using `startUpdate(true)`, the `mutate` event will not fire at all when `endUpdate(true)` is called. This is useful when you want to perform internal updates without notifying listeners.
-   **`filterMode`**: The `filterMode` config can be set to `'primitive'` or `'advanced'`. `'primitive'` is generally faster for simple filters, while `'advanced'` is needed for filters that depend on other collection items.
-   **`keyProperty`**: Ensure your `keyProperty` is truly unique for each item to leverage the `map_` for efficient lookups.

## Cloning Collections

When you clone a collection using `collection.clone()`, a new collection instance is created with a shallow copy of the *current items*. However, the filters and sorters of the cloned collection are based on the *original configuration* of the source collection, not its currently active filters or sorters. This means if the original collection had filters or sorters applied after its initial creation, the cloned collection will not inherit those dynamic changes unless explicitly reapplied.
