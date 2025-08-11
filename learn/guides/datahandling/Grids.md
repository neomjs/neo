# Neo.mjs Grids

The `Neo.grid.Container` is a powerful and highly performant component for displaying tabular data. It is designed to
handle large datasets with ease, thanks to its virtual rendering engine, which only renders the DOM for the visible
rows and columns.

## Key Features

- **High Performance:** Optimized for handling large amounts of data through virtual rendering.
- **Flexible Data Model:** Integrates seamlessly with `Neo.data.Store` and `Neo.data.Model`.
- **Rich Column Types:** Supports various column types, including component-based columns.
- **Advanced Selection Models:** Offers a variety of selection models for rows, cells, and columns.
- **Sorting and Filtering:** Built-in support for column sorting and data filtering, including header filters.
- **Cell Editing:** Built-in support for editing cell values directly within the grid.
- **Customizable:** Easily extendable and customizable to fit your needs.

## Basic Grid Setup

Creating a grid is straightforward. You need a `Neo.grid.Container`, define your `columns`, and provide a `store`.

```javascript live-preview
import GridContainer from '../grid/Container.mjs';
import Store         from '../data/Store.mjs';
import Viewport      from '../container/Viewport.mjs';

class MainView extends Viewport {
    static config = {
        className: 'MainView',
        layout   : {ntype: 'fit'},
        items    : [{
            module: GridContainer,
            store : { // Inline store configuration
                model: {
                    fields: [
                        {name: 'firstname', type: 'String'},
                        {name: 'lastname',  type: 'String'}
                    ]
                },
                data: [
                    {firstname: 'Tobias', lastname: 'Uhlig'},
                    {firstname: 'Rich',   lastname: 'Waters'}
                ]
            },
            columns: [
                {text: 'Firstname', dataField: 'firstname'},
                {text: 'Lastname',  dataField: 'lastname'}
            ]
        }]
    }
}
MainView = Neo.setupClass(MainView);
```

In this example, we create a simple grid with two columns. The `dataField` in each column configuration maps to a
field in the store's model. You can further customize the grid's behavior and appearance
by providing `body` and `headerToolbarConfig`.

## Integrating with Stores

The `store` config is central to the `Neo.grid.Container`, as it provides the data to be displayed.
You have several flexible ways to define and provide a store:

### 1. Inline Store Configuration (Plain JavaScript Object)

This is the most common approach for simple grids, where the store's model and data are defined directly within the
grid's configuration. The grid automatically creates a `Neo.data.Store` instance from this object.

```javascript readonly
store: {
    model: {
        fields: [
            {name: 'id',   type: 'Number'},
            {name: 'name', type: 'String'}
        ]
    },
    data: [
        {id: 1, name: 'Item 1'},
        {id: 2, name: 'Item 2'}
    ]
}
```

### 2. Store Class Reference

For more complex data handling or reusable store logic, you can define a separate `Neo.data.Store` class and provide a
reference to it. The grid will then instantiate this class.

```javascript readonly
import MyCustomStore from './MyCustomStore.mjs'; // Assuming MyCustomStore extends Neo.data.Store

// ...
store: MyCustomStore
```

### 3. Pre-created Store Instance

If you need to share a single store instance across multiple grids or manage its lifecycle externally, you can create
the store instance beforehand and pass it directly to the grid.

```javascript readonly
import Store from '../data/Store.mjs';

const mySharedStore = Neo.create(Store, {
    model: { /* ... */ },
    data: [ /* ... */ ]
});

// ...
store: mySharedStore
```

Regardless of the method chosen, the grid's `beforeSetStore` hook (as seen in `Neo.grid.Container.mjs`) ensures that the
`store` property always resolves to a valid `Neo.data.Store` instance, providing a consistent and robust API.

### 4. Centralized Store Management with `Neo.state.Provider`

For more complex applications, `Neo.state.Provider` offers a powerful way to manage multiple stores centrally and share
them across various components using the binding system. This approach promotes better organization and reusability of
your data.

First, define your stores within a `Neo.state.Provider`'s `stores` config:

```javascript readonly
import Provider from '../state/Provider.mjs';
import Store    from '../data/Store.mjs';

class AppStateProvider extends Provider {
    static config = {
        className: 'AppStateProvider',
        stores: {
            users: {
                module: Store,
                model : {fields: ['id', 'name']},
                data  : [{id: 1, name: 'Alice'}, {id: 2, name: 'Bob'}]
            },
            products: {
                module: Store,
                model : {fields: ['id', 'item', 'price']},
                data  : [{id: 1, item: 'Laptop', price: 1200}, {id: 2, item: 'Mouse', price: 25}]
            }
        }
    }
}
Neo.setupClass(AppStateProvider);
```

Then, in your `GridContainer` (or any other component), you can bind to these stores using the `bind` config. The
`Neo.state.Provider` will automatically inject the correct store instance.

```javascript live-preview
import GridContainer from '../grid/Container.mjs';
import Provider      from '../state/Provider.mjs';
import Store         from '../data/Store.mjs';
import Viewport      from '../container/Viewport.mjs';

class AppStateProvider extends Provider {
    static config = {
        className: 'AppStateProvider',
        stores: {
            users: {
                module: Store,
                model : { fields: ['id', 'name'] },
                data  : [{id: 1, name: 'Alice'}, {id: 2, name: 'Bob'}]
            }
        }
    }
}
Neo.setupClass(AppStateProvider);

class MainView extends Viewport {
    static config = {
        className: 'MainView',
        layout   : {ntype: 'fit'},
        // Attach the state provider to the viewport
        stateProvider: AppStateProvider,
        items    : [{
            module: GridContainer,
            // Bind the grid's store config to the 'users' store defined in the state provider
            bind: {
                store: 'stores.users'
            },
            columns: [
                {text: 'ID',   dataField: 'id'},
                {text: 'Name', dataField: 'name'}
            ]
        }]
    }
}
MainView = Neo.setupClass(MainView);
```

This pattern is particularly beneficial for:
* **Centralized State:** All application-level stores are defined in one place, making them easy to locate and manage.
* **Reusability:** Stores can be easily shared and reused across different parts of your application without manual
*   instantiation and passing.
* **Decoupling:** Components become more decoupled from direct store instantiation, relying instead on the state provider
  to inject the necessary data.
* **Testability:** Centralized stores can be more easily mocked or swapped for testing purposes.

## Columns

## Sorting

Neo.mjs grids provide built-in support for sorting data by one or more columns. Sorting is primarily managed by the
grid's underlying `Neo.data.Store`.

### Enabling Sorting

To enable sorting for a column, ensure the `sortable` config is set to `true` on the `Neo.grid.Container` (which is its
default value). Then, simply click on a column header to sort the data by that column. Clicking again will reverse the
sort direction.

```javascript live-preview
import GridContainer from '../grid/Container.mjs';
import Store         from '../data/Store.mjs';
import Viewport      from '../container/Viewport.mjs';

class MainView extends Viewport {
    static config = {
        className: 'MainView',
        layout   : {ntype: 'fit'},
        items    : [{
            module: GridContainer,
            sortable: true, // Default is true, but explicitly shown here
            store : {
                model: {
                    fields: [
                        {name: 'name', type: 'String'},
                        {name: 'age',  type: 'Number'}
                    ]
                },
                data: [
                    {name: 'Alice',   age: 30},
                    {name: 'Bob',     age: 24},
                    {name: 'Charlie', age: 35},
                    {name: 'David',   age: 28}
                ]
            },
            columns: [
                {text: 'Name', dataField: 'name'},
                {text: 'Age',  dataField: 'age'}
            ]
        }]
    }
}
MainView = Neo.setupClass(MainView);
```

### Initial Sorting

You can define an initial sort order for your store using the `sorters` config.

```javascript readonly
store: {
    model: { /* ... */ },
    data: [ /* ... */ ],
    sorters: [{
        property : 'name',
        direction: 'ASC' // 'ASC' for ascending, 'DESC' for descending
    }]
}
```

### Programmatic Sorting

You can also sort the store programmatically using the `sort` method of the store instance.

```javascript readonly
myGrid.getStore().sort({
    property : 'age',
    direction: 'DESC'
});
```

## Columns

Columns are the building blocks of a grid. You can configure them with various options.

### Column Types

Neo.mjs provides several specialized column types:

- `Neo.grid.column.Base`: The default column type.
- `Neo.grid.column.Index`: Displays the row number.
- `Neo.grid.column.Component`: Renders a Neo.mjs component inside each cell.
- `Neo.grid.column.Currency`: For formatting currency values.
- `Neo.grid.column.AnimatedChange`: Animates cell value changes.
- `Neo.grid.column.AnimatedCurrency`: Animates currency cell value changes.
- `Neo.grid.column.Progress`: Renders a progress bar component.

You can specify the column type using the `type` config:

```javascript readonly
{
    type: 'index',
    text: '#'
}
```

### Custom Rendering

For more complex cell content, you can use a `renderer` function. The renderer receives an object with details
about the cell, record, and store.

```javascript readonly
{
    text    : 'Full Name',
    renderer: data => `${data.record.firstname} ${data.record.lastname}`
}
```

### Nested Record Fields

The grid supports displaying data from nested objects within your records. Simply use a dot-separated path for the
`dataField` config.

Given a record like:
```json
{
  "id": 1,
  "user": {
    "firstname": "John",
    "lastname" : "Doe"
  }
}
```

You can define your columns like this:
```javascript readonly
columns: [
    {text: 'Firstname', dataField: 'user.firstname'},
    {text: 'Lastname',  dataField: 'user.lastname'}
]
```
The `examples/grid/nestedRecordFields` example provides a live demonstration of this feature.

### Header Filters

Grids can include header filters, allowing users to filter data directly from the column headers. To enable this feature,
set the `showHeaderFilters` config to `true` on the `Neo.grid.Container`.

```javascript live-preview
import GridContainer from '../grid/Container.mjs';
import Store         from '../data/Store.mjs';
import Viewport      from '../container/Viewport.mjs';

class MainView extends Viewport {
    static config = {
        className: 'MainView',
        layout   : {ntype: 'fit'},
        items    : [{
            module           : GridContainer,
            showHeaderFilters: true, // Enable header filters
            store            : {
                model: {
                    fields: [
                        {name: 'city',       type: 'String'},
                        {name: 'population', type: 'Number'}
                    ]
                },
                data: [
                    {city: 'New York',    population: 8419000},
                    {city: 'Los Angeles', population: 3980000},
                    {city: 'Chicago',     population: 2716000},
                    {city: 'Houston',     population: 2320000}
                ]
            },
            columns: [
                {text: 'City',       dataField: 'city',       filterable: true},
                {text: 'Population', dataField: 'population', filterable: true}
            ]
        }]
    }
}
MainView = Neo.setupClass(MainView);
```

For a column to be filterable, you must also set its `filterable` config to `true`. The grid automatically provides a
text input filter for string fields and a number input filter for number fields. More complex filter types can be
implemented by extending `Neo.grid.header.Filter`.

## Sorting

Neo.mjs grids provide built-in support for sorting data by one or more columns. Sorting is primarily managed by the
grid's underlying `Neo.data.Store`.

### Enabling Sorting

To enable sorting for a column, ensure the `sortable` config is set to `true` on the `Neo.grid.Container` (which is its
default value). Then, simply click on a column header to sort the data by that column. Clicking again will reverse the
sort direction.

```javascript live-preview
import GridContainer from '../grid/Container.mjs';
import Store         from '../data/Store.mjs';
import Viewport      from '../container/Viewport.mjs';

class MainView extends Viewport {
    static config = {
        className: 'MainView',
        layout   : {ntype: 'fit'},
        items    : [{
            module: GridContainer,
            sortable: true, // Default is true, but explicitly shown here
            store : {
                model: {
                    fields: [
                        {name: 'name', type: 'String'},
                        {name: 'age',  type: 'Number'}
                    ]
                },
                data: [
                    {name: 'Alice', age: 30},
                    {name: 'Bob',   age: 24},
                    {name: 'Charlie', age: 35},
                    {name: 'David', age: 28}
                ]
            },
            columns: [
                {text: 'Name', dataField: 'name'},
                {text: 'Age',  dataField: 'age'}
            ]
        }]
    }
}
MainView = Neo.setupClass(MainView);
```

### Initial Sorting

You can define an initial sort order for your store using the `sorters` config.

```javascript readonly
store: {
    model: { /* ... */ },
    data: [ /* ... */ ],
    sorters: [{
        property : 'name',
        direction: 'ASC' // 'ASC' for ascending, 'DESC' for descending
    }]
}
```

### Programmatic Sorting

You can also sort the store programmatically using one of the following 2 options:

```javascript readonly
// Option 1: Directly modifying the existing sorter
myGrid.getSorter('name').direction = 'DESC';

// Option 2: Assigning a new value to the sorters config
myGrid.sorters = [{
    property : 'name',
    direction: 'DESC' 
}];
```

## Filtering

Beyond header filters, you can programmatically filter the grid's data using the `filters` config on the store.
This allows for more complex filtering logic and dynamic updates.

### Applying Filters

To apply filters, set the `filters` config on your store. This config accepts an array of filter objects.

```javascript live-preview
import GridContainer from '../grid/Container.mjs';
import Store         from '../data/Store.mjs';
import Viewport      from '../container/Viewport.mjs';

class MainView extends Viewport {
    static config = {
        className: 'MainView',
        layout   : {ntype: 'fit'},
        items    : [{
            module: GridContainer,
            store : {
                model: {
                    fields: [
                        {name: 'product', type: 'String'},
                        {name: 'price',  type: 'Number'}
                    ]
                },
                data: [
                    {product: 'Laptop', price: 1200},
                    {product: 'Mouse',  price: 25},
                    {product: 'Keyboard', price: 75},
                    {product: 'Monitor', price: 300}
                ],
                filters: [{
                    property: 'price',
                    operator: '>=',
                    value   : 100
                }] // Initial filter: price >= 100
            },
            columns: [
                {text: 'Product', dataField: 'product'},
                {text: 'Price',  dataField: 'price'}
            ]
        }]
    }
}
MainView = Neo.setupClass(MainView);
```

Each filter object typically has:
- `property`: The data field to filter on.
- `operator`: The comparison operator (e.g., `'='`, `'>'`, `'<='`, `'like'`).
- `value`: The value to compare against.

### Clearing Filters

To clear all filters, simply set the `filters` config to `null` or an empty array.

```javascript readonly
myGrid.getStore().filters = null;
// or
myGrid.getStore().filters = [];
```

### Adding Filters Programmatically

You can dynamically add or modify filters by getting the current filters, adding new ones, and then setting the `filters`
config again.

```javascript readonly
const store = myGrid.getStore();
const currentFilters = store.filters ? [...store.filters] : [];

currentFilters.push({
    property: 'product',
    operator: 'like',
    value   : 'o' // Filter products containing 'o'
});

store.filters = currentFilters;
```

## Plugins

Neo.mjs grids support various plugins to extend their functionality. Plugins are typically enabled by setting a
configuration property on the `Neo.grid.Container` or `Neo.grid.Body`.

### Cell Editing

Enable cell editing by setting the `cellEditing` config to `true` on the `Neo.grid.Container`.

```javascript readonly
const myGrid = Neo.create(GridContainer, {
    cellEditing: true,
    // ...
});
```

### Animated Row Sorting

To animate row sorting, set the `animatedRowSorting` config to `true` on the `Neo.grid.Body` (via `body`).

```javascript readonly
const myGrid = Neo.create(GridContainer, {
    body: {
        animatedRowSorting: true
    },
    // ...
});
```

## Selection Models

The grid's selection behavior is controlled by a selection model, which you can configure on the `body`.

Available selection models in `Neo.selection.grid`:
- `RowModel`: Selects entire rows.
- `CellModel`: Selects individual cells.
- `ColumnModel`: Selects entire columns.
- And combinations like `CellRowModel`, `CellColumnModel`, `CellColumnRowModel`.

```javascript readonly
import {RowModel} from '../../../src/selection/grid/_export.mjs';

const myGrid = Neo.create(GridContainer, {
    // ...
    body: {
        selectionModel: RowModel
    }
});
```

## Performance and Big Data

The grid is designed for exceptional performance, especially when dealing with large datasets. Its virtual rendering
engine ensures that only the visible parts of the grid (rows and columns) are rendered in the DOM, significantly
reducing memory consumption and improving rendering speed.

You### Optimizing Virtual Rendering

You can fine-tune the virtual rendering behavior with the `bufferRowRange` and `bufferColumnRange` configs in the
`body`. These settings define how many extra rows and columns to render outside the visible area to provide a
smoother scrolling experience.

```javascript readonly
const myGrid = Neo.create(GridContainer, {
    body: {
        bufferRowRange   : 5, // Render 5 extra rows above and below the visible area
        bufferColumnRange: 2  // Render 2 extra columns to the left and right of the visible area
    },
    // ...
});
```

### Row Height

The `rowHeight` config on the `Neo.grid.Container` plays a crucial role in the grid's rendering calculations. Ensuring
an accurate `rowHeight` is essential for the virtual rendering engine to correctly determine the number of visible rows
and the scrollable area. While the default value of `32px` is often suitable, you should adjust it if your grid rows
have a different fixed height.

The `examples/grid/bigData` example showcases the grid's performance with a large dataset, allowing you to
dynamically adjust the number of rows and columns.
