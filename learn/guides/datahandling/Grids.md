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
field in the store's model. You can further customize the grid's behavior and appearance by providing `bodyConfig` and `headerToolbarConfig`.

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
    "lastname": "Doe"
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

To animate row sorting, set the `animatedRowSorting` config to `true` on the `Neo.grid.Body` (via `bodyConfig`).

```javascript readonly
const myGrid = Neo.create(GridContainer, {
    bodyConfig: {
        animatedRowSorting: true
    },
    // ...
});
```

## Selection Models

The grid's selection behavior is controlled by a selection model, which you can configure on the `bodyConfig`.

Available selection models in `Neo.selection.grid`:
- `RowModel`: Selects entire rows.
- `CellModel`: Selects individual cells.
- `ColumnModel`: Selects entire columns.
- And combinations like `CellRowModel`, `CellColumnModel`, `CellColumnRowModel`.

```javascript readonly
import {RowModel} from '../../../src/selection/grid/_export.mjs';

const myGrid = Neo.create(GridContainer, {
    // ...
    bodyConfig: {
        selectionModel: RowModel
    }
});
```

## Performance and Big Data

The grid is designed for exceptional performance, especially when dealing with large datasets. Its virtual rendering engine ensures that only the visible parts of the grid (rows and columns) are rendered in the DOM, significantly reducing memory consumption and improving rendering speed.

You### Optimizing Virtual Rendering

You can fine-tune the virtual rendering behavior with the `bufferRowRange` and `bufferColumnRange` configs in the `bodyConfig`. These settings define how many extra rows and columns to render outside the visible area to provide a smoother scrolling experience.

```javascript readonly
const myGrid = Neo.create(GridContainer, {
    bodyConfig: {
        bufferRowRange   : 5, // Render 5 extra rows above and below the visible area
        bufferColumnRange: 2  // Render 2 extra columns to the left and right of the visible area
    },
    // ...
});
```

### Row Height

The `rowHeight` config on the `Neo.grid.Container` plays a crucial role in the grid's rendering calculations. Ensuring an accurate `rowHeight` is essential for the virtual rendering engine to correctly determine the number of visible rows and the scrollable area. While the default value of `32px` is often suitable, you should adjust it if your grid rows have a different fixed height.

The `examples/grid/bigData` example showcases the grid's performance with a large dataset, allowing you to
dynamically adjust the number of rows and columns.
