---
seoTitle: "JavaScript Data Grid Guide: Virtual Scrolling & Pooled Cells | Neo.mjs"
seoDescription: "Build high-performance JavaScript data grids with Neo.grid.Container: virtual scrolling, pooled DOM cells, sorting, header filters, and inline editing."
---
# JavaScript Data Grids: Virtual Scrolling & Pooled Cells

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
export default Neo.setupClass(MainView);
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
export default Neo.setupClass(MainView);
```

This pattern is particularly beneficial for:
* **Centralized State:** All application-level stores are defined in one place, making them easy to locate and manage.
* **Reusability:** Stores can be easily shared and reused across different parts of your application without manual
*   instantiation and passing.
* **Decoupling:** Components become more decoupled from direct store instantiation, relying instead on the state provider
  to inject the necessary data.
* **Testability:** Centralized stores can be more easily mocked or swapped for testing purposes.

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
import GridContainer   from '../grid/Container.mjs';
import NumberContainer from '../filter/NumberContainer.mjs';
import Viewport        from '../container/Viewport.mjs';

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
                {text: 'City', dataField: 'city'},
                {
                    text        : 'Population',
                    dataField   : 'population',
                    filterConfig: {operator: '>='},

                    // The operator button cycles through `operators`, which must hold the one the filter starts with,
                    // and the number field's default maxValue of 100 would clamp a typed population
                    editorConfig: {
                        module      : NumberContainer,
                        buttonConfig: {operators: ['>=', '<=', '===']},
                        fieldConfig : {maxValue: 10000000},
                        operator    : '>='
                    }
                }
            ]
        }]
    }
}
export default Neo.setupClass(MainView);
```

Every column of such a grid gets a text field in its header, which keeps the rows whose value contains what you type
(the `like` operator). A column chooses another field with `editorConfig`, as the population column does with
`Neo.filter.NumberContainer`, and the comparison its filter applies with `filterConfig`. `Neo.filter` also holds a
`DateContainer` and a `BooleanContainer`, and a `ComboBox` filters a column by a fixed set of values. The
`examples/grid/filtering` example uses all four on 10,000 rows.

### Grid Search Toolbar

Set `searchToolbar` to an object to add a search toolbar above the grid. It is `null` by default, so existing grids
keep their current layout until the feature is enabled.

```javascript readonly
{
    module: GridContainer,
    searchToolbar: {},
    store,
    columns: [
        {text: 'Name',   dataField: 'name'},
        {text: 'Status', dataField: 'status'}
    ]
}
```

The toolbar searches local, resolved field values with literal text. Whitespace separates terms, and every term must
match somewhere in the selected search scope; the terms are combined with AND. A new search starts with the grid's
searchable columns, including locked columns. Choose **All record fields** to also search values the grid does not
display, or choose one named column. The scope menu identifies the selected choice and lists the stored search fields
using column captions. A stored field absent from this grid is identified as **Record field: name**. A case toggle
controls whether matching distinguishes letter case. Search does not
interpret regular expressions.

A column without searchable text or a configured text conversion stays listed as **not searchable**. The search
field itself shows the query; it is not repeated as a filter chip. Effective header filters have removable chips,
while application restrictions and inactive-search explanations remain visible beside them.

The toolbar's `fieldText` config maps field names to `(value, item) => String` conversions, for example for Date
fields. The hooks receive canonical field values and raw items; they do not call renderers or hydrate records.
They are stored with the search on an explicit write. A toolbar that joins an existing search retains its stored
hooks along with its field list.

The search intent belongs to the Store, so grids sharing that Store share the search and the intent survives toolbar
recreation. Clearing the text makes the search inactive while retaining its scope and case setting. Removing a
header-filter chip removes that contribution. The toolbar's Clear filters action removes the grid-owned search,
header, and value-picker filter roles together; application-owned filters remain active. Remote projections and tree
grids cannot provide the complete local flat population this search requires, so the toolbar reports that limitation
instead of applying a partial result.

### Column Value Menus

Set `columnMenu: true` on [Neo.grid.Container](../../../src/grid/Container.mjs) to add a value picker to its column headers.
Each column can override the grid setting: `columnMenu: false` hides its menu, `true` enables it,
and the default `null` follows the grid. The feature is off by default.

```javascript readonly
{
    module: GridContainer,
    columnMenu: true,
    store,
    columns: [
        {dataField: 'status', text: 'Status', width: 180},
        {dataField: 'region', text: 'Region', width: 180},
        {dataField: 'notes', text: 'Notes', width: 240, columnMenu: false}
    ]
}
```

Open a menu with a right click, the header's arrow button, `Shift+F10`, or the context-menu key.
The arrow appears on hover or keyboard focus and stays visible on devices without hover. Escape or
an outside pointer dismisses the menu and returns focus to the header. The header retains its sort,
resize and reorder interactions.

Check one or more values to include them. Values within a column combine with OR; filters across
columns combine with AND. Counts reflect the complete available Store population under the other
active filters, including inline and application filters on the same column. They exclude this
menu's own selection, so users can still see alternative values. The search field narrows the option
labels with a case-insensitive literal substring; it does not filter grid records or alter checks.
Date labels follow `Neo.config.locale`, showing only the date at exact local or UTC midnight and both the local date
and time for other timestamps. UTC-midnight values use the UTC calendar date, so an ISO date-only value keeps
its day across time zones. Empty strings display as `(blank)`, `null` as `(null)`, and `undefined` as
`(undefined)`; other scalars keep their `String(value)` form. Labels do not merge typed option keys, so equal
labels can represent distinct values, and formatting never calls a cell renderer.

Selected values remain visible and removable when their count reaches zero or the search does not
match them. New source values appear unchecked. Clear, or unchecking the final value, removes only
this column menu's contribution. Inline header filters and application filters remain active.
Two grids sharing a Store share these selections and counts; recreating a header reads the existing
selection. Removing the menu leaves its Store-owned filter intact.

The menu uses [Neo.list.ValuePicker](../../../src/list/ValuePicker.mjs), which buffers its option rows and displays up to 1,000
unselected search matches by default. When more match, its footer asks the user to refine the search;
selected options remain available in addition to that cap.

Value counts require a complete, fully loaded local flat population with canonical comparable values.
Normal Turbo Stores with simple canonical fields are supported without initializing offscreen records.
Remote projections, incomplete data, trees, unknown fields, complex raw records and values that cannot
be compared display an explanation instead of applying a partial filter. An application needing server
facets must supply that authority separately; visible buffered rows cannot establish complete counts.

## Header label alignment

By default every column header label sits at its left edge.
For numeric or currency columns whose cells are right-aligned, that leaves the label ~200 px from the digits it describes.
`headerAlign` closes that gap by moving only the label — it does not touch cell alignment.

| Value | Effect |
|---|---|
| `'left'` (default) | Label at the left edge — no extra class, no change to existing grids. |
| `'right'` | Label at the right edge — mirrors the digits of a right-aligned column. |
| `'center'` | Label centred inside the header width. |
| `'auto'` | Label tracks `cellAlign`: right column → right label, left column → left label. Changing `cellAlign` at runtime moves the label with it. |

### Per-column `headerAlign`

```javascript
columns: [
    {
        cellAlign  : 'right',
        dataField  : 'amount',
        headerAlign: 'right',   // label sits over the digits
        text       : 'Amount'
    },
    {dataField: 'name', text: 'Name'}  // no headerAlign → default left
]
```

### Grid-wide `auto` alignment with `columnDefaults`

`'auto'` is the most convenient choice when every numeric column already carries `cellAlign: 'right'`:
the header label follows without any per-column config.

```javascript
{
    module        : GridContainer,
    columnDefaults: {headerAlign: 'auto'},
    columns: [
        {cellAlign: 'right', dataField: 'amount',   text: 'Amount'},
        {cellAlign: 'right', dataField: 'quantity',  text: 'Qty'},
        {dataField: 'name',  text: 'Name'}          // cellAlign defaults to left → label stays left
    ]
}
```

> [!TIP]
> The sort glyph, column-menu trigger, and inline filter field all stay inside the header regardless of `headerAlign`.
> Setting `headerAlign` does not affect `cellAlign`; both configs are independent.

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
export default Neo.setupClass(MainView);
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

You can also sort from code, through the grid's store: `sort()` replaces the sorters with one, and assigning `sorters`
replaces them with any number.

```javascript readonly
myGrid.store.sort({property: 'age', direction: 'DESC'});

myGrid.store.sorters = [{
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
export default Neo.setupClass(MainView);
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
configuration property on the `Neo.grid.Container` or `Neo.grid.Body`. Cell editing is a plugin too, and has a section
of its own below.

### Animated Row Sorting

To animate row sorting, set the `animatedRowSorting` config to `true` on the `Neo.grid.Body` (via `body`).
The current `AnimateRows` plugin is a flat-store row sorting/filtering affordance. Do not use it as a
TreeGrid expand/collapse animation path; TreeGrid structural animation must follow the
[pooled row contract](./PooledGridAnimation.md).

```javascript readonly
const myGrid = Neo.create(GridContainer, {
    body: {
        animatedRowSorting: true
    },
    // ...
});
```

## Selection Models

The grid's selection behavior is controlled by one selection model, owned by the grid's view: configure it through
`viewConfig` (a `RowModel` is the default; `null` selects nothing), and write `grid.view.selectionModel` at runtime.

Available selection models in `Neo.selection.grid`:
- `RowModel`: Selects entire rows.
- `CellModel`: Selects individual cells.
- `ColumnModel`: Selects entire columns.
- And combinations like `CellRowModel`, `CellColumnModel`, `CellColumnRowModel`.

```javascript readonly
import {RowModel} from '../../../src/selection/grid/_export.mjs';

const myGrid = Neo.create(GridContainer, {
    // ...
    viewConfig: {
        selectionModel: RowModel
    }
});
```

To read a selection at the time of an action, like a toolbar button's handler, use `grid.view.selectedRecords`: the
selected rows' records, or `[]` when the model selects cells or columns, or there is none. `grid.view.selectedRows`
holds the grid's row ids instead, which are the store's internal ids while `useInternalId` is `true` (the default), not
the record keys. To react to a change, listen to the model's `selectionChange` event, which carries the `records`.

## Cell Editing

A grid that renders only what is visible meets a hard question the moment someone types into it. The cell under the
caret does not belong to its record. The body keeps a small pool of rows, and each row a pool of cell slots, so the
node you are typing into goes to another record as soon as the grid scrolls. There are three obvious answers for the
draft inside it, and each one fails someone. Writing it saves a half-typed value for the user who only scrolled to look
something up. Throwing it away loses what they typed. Keeping the row alive stops pooling it, and the grid no longer
scales.

The grid takes none of them. An edit is a session in the App Worker, keyed by what does not move: the record's id and
the column's `dataField`. Its editor is an ordinary form field, and the grid only *embodies* it, in whichever cell
renders that record and field at the moment. When pooling takes that cell away, the session waits, suspended, with its
draft, and the next render that shows the cell embodies the editor again. Scrolling never commits an edit, and never
cancels one.

```mermaid
flowchart TD
    Idle(["No edit"])
    Embodied["Embodied: the editor sits in the cell that renders its record and field"]
    Suspended["Suspended: the cell has left the DOM, and the editor and its draft wait in the App Worker"]
    Committed["Committed: a valid draft is written to the record"]
    Cancelled["Cancelled: the draft is discarded"]

    Idle -->|"double-click, Enter or F2"| Embodied
    Embodied -->|"a scroll, sort or filter takes the cell away"| Suspended
    Suspended -->|"a render shows the cell again"| Embodied
    Embodied -->|"Enter, Tab, a click elsewhere, focus leaving the grid"| Committed
    Suspended -->|"Tab or arrow navigation"| Committed
    Embodied -->|"Escape"| Cancelled
    Embodied -->|"the cell goes, on a column that cannot suspend"| Cancelled
    Committed --> Idle
    Cancelled --> Idle
```

The `examples/grid/cellEditing` example is a fuller version of the preview below. It adds a country picker, a choice of
selection models, and a checkbox that turns editing off and on.

### Turning It On

Set `cellEditing: true` on the `Neo.grid.Container`, and mark the columns it may edit with `editable`. A column's
`editor` is the config its field is created from. Without one, a cell edits with a `Neo.form.field.Text`.

```javascript live-preview
import CellModel     from '../selection/grid/CellModel.mjs';
import DateField     from '../form/field/Date.mjs';
import GridContainer from '../grid/Container.mjs';
import NumberField   from '../form/field/Number.mjs';
import Viewport      from '../container/Viewport.mjs';

class MainView extends Viewport {
    static config = {
        className: 'MainView',
        layout   : {ntype: 'fit'},
        items    : [{
            module        : GridContainer,
            cellEditing   : true,
            columnDefaults: {editable: true},

            // Enter and F2 edit the selected cell, so keyboard editing needs a model that selects cells
            viewConfig: {selectionModel: CellModel},

            store: {
                keyProperty: 'githubId',
                model: {
                    fields: [
                        {name: 'firstname',    type: 'String'},
                        {name: 'githubId',     type: 'String'},
                        {name: 'randomDate',   type: 'Date'},
                        {name: 'randomNumber', type: 'Int'}
                    ]
                },
                data: [
                    {firstname: 'Tobias', githubId: 'tobiu',      randomDate: '2024-12-20', randomNumber: 100},
                    {firstname: 'Rich',   githubId: 'rwaters',    randomDate: '2024-12-18', randomNumber: 90},
                    {firstname: 'Nils',   githubId: 'mrsunshine', randomDate: '2024-12-19', randomNumber: 70}
                ]
            },

            columns: [{
                dataField: 'firstname',
                text     : 'Firstname'
            }, {
                dataField: 'randomNumber',
                text     : 'Number (step 5)',
                editor   : {module: NumberField, maxValue: 100, minValue: 0, stepSize: 5}
            }, {
                dataField: 'randomDate',
                renderer : ({value}) => new Intl.DateTimeFormat('default').format(value),
                text     : 'Random Date',
                editor   : {module: DateField, clearable: false, maxValue: '2024-12-20', minValue: '2024-12-10'}
            }, {
                dataField: 'githubId',
                editable : false,
                text     : 'Github Id'
            }]
        }]
    }
}
export default Neo.setupClass(MainView);
```

`editable` is reactive. Turning it off on a column while one of its cells is being edited cancels that edit.

### Starting an Edit

- A double-click on an editable cell edits it.
- Enter or F2 edits the selected cell. With a selected row and no selected cell — under `RowModel`, the default —
  they edit that row: in the column of the grid's last edit, or the row's first editable column, scrolled into sight
  when it is out of it. With neither a cell nor a row selected, the keyboard starts nothing.
- Space starts nothing. A column that is not editable refuses the double-click, Enter and F2 alike.
- The editor opens with its whole value selected, so typing replaces the value instead of appending to it.
- One editor exists at a time. Activating another cell commits the current draft first.

Inside the editor, the keys and the pointer belong to the field: the navigation keys never scroll the grid, and a drag
selects text instead of drag-scrolling it.

### Ending an Edit

| Gesture | What happens |
|---|---|
| Enter | Commits the draft. Focus returns to the grid, and a model that selects cells keeps the edited cell selected, so the arrow keys go on from there. |
| Escape | Discards the draft. Focus returns to the grid. |
| Tab, Shift+Tab | Commits, and edits the next or previous editable cell: across locked columns, past columns that cannot be edited, and on into the next or previous record. Past the last editable cell, or before the first, the edit ends with focus on the grid. |
| A click on another cell | Commits, and selects that cell. |
| Focus leaving the grid | Commits. |

A model that selects rows keeps the edited record's row selected for as long as the edit lasts, and moves it along as
Tab walks into another record. However the edit ends, the arrow keys go on from that row, and Enter edits it again.
A model that selects columns keeps the edited cell's column selected the same way, so the arrow keys move the selected
cell and its column together afterwards.

A commit writes a valid draft to its record. An invalid draft keeps its editor: Enter, Tab, a click on another cell and
focus leaving the grid all leave the edit open and write nothing. While no edit is open, Tab is the browser's own.

A field with a picker, like the example's `DateField`, keeps the picker inside the edit. Its trigger opens the picker,
and so does Alt+ArrowDown, the key the WAI-ARIA date-picker pattern names; plain ArrowDown stays the date input's own.
Focus moving into the picker does not end the edit, and a day picked there becomes the draft. Escape closes an open
picker first, and the next Escape cancels the edit. Enter commits, as in any other editor, and opens no picker: in a
grid, Enter belongs to the edit, so the grid gives its editors `showPickerOnEnter: false`.

### What Scrolling Does to an Edit

Pooling takes a cell out of the DOM in two ways: a vertical scroll hands its row to another record, and a horizontal
scroll moves its column out of the mounted window. For an open edit the two are the same event:

- A scroll that keeps the cell rendered keeps the editor, and its focus.
- A scroll that takes the cell away suspends the edit. The editor and its draft wait in the App Worker.
- The render that shows the cell again embodies the editor, with the draft as it was.

The store moves records too, and the edit follows the same rules. A sort or filter that takes the edited record out of
the pool and back suspends the edit and restores it. An update to another field of the edited record repaints its cell
and leaves the editor, the draft and focus alone. An update to the edited field itself keeps the draft, and Enter
writes the draft over the new value. Removing the record removes the editor with it.

A commit moves no row, even into the column the grid is sorted by: the edited row keeps its place, so Tab goes on in
the row the user is looking at. Sorters apply when they change, and the next click on the column's header puts the row
where its new value belongs.

Locking or unlocking a column moves it to another body. The editor stays out of every cell until the bodies have
swapped their columns, then returns with its draft.

A suspended edit still answers Tab and Shift+Tab: they commit it and edit the next or previous cell. An arrow on the
View commits the suspended draft before the selection model moves to the next row or cell, ending the edit. Either
gesture blocks when the draft is invalid: selection stays put, the cell is scrolled back into sight, and the same
editor takes focus with its validation error visible. Arrows inside an embodied editor keep their field's meaning.

An IME composition in flight when its row leaves the pool survives as the draft. The composed text reaches the field
as it is typed, so there is nothing that only the DOM holds.

### Editors That Cannot Be Suspended

Suspension relies on the editor keeping its state in the App Worker, and the engine's form fields do: the draft is the
field's value. An editor that keeps state only in its DOM cannot be suspended. Give its column
`cancelEditOnProjectionLoss: true`: when pooling takes the cell away, the edit is cancelled instead, its draft
discarded, and the grid announces it. A lock change that moves such a column to another body cancels its edit too.

An edit that starts on a cell that is not rendered yet is different. Tab to a cell out of sight scrolls it into sight
and starts its edit before the cell renders, and the cell's first render embodies it: an edit that was never embodied
has no embodiment to lose.

### Listening for Cancelled Edits

No cancel is silent: the grid fires `cellEditCancel` with `{dataField, reason, record}` for every edit it cancels. A
commit fires nothing.

| `reason` | The edit was cancelled because |
|---|---|
| `escape` | Escape was pressed. |
| `notEditable` | the column's `editable` was turned off. |
| `disabled` | the plugin's `disabled` was turned on. |
| `destroy` | the plugin was destroyed while its grid lives on. |
| `projectionLoss` | pooling took away the cell of a column that cannot be suspended. |
| `api` | code called the plugin's `cancelEdit()` without a reason. |

```javascript readonly
const myGrid = Neo.create(GridContainer, {
    cellEditing: true,

    listeners: {
        cellEditCancel({dataField, reason, record}) {
            console.log(`The ${dataField} edit ended without a write: ${reason}`)
        }
    }
    // ...
});
```

### Turning Editing Off

The plugin's `disabled` config cancels an open edit and ignores every activation until it is turned off again. This
is what the example's "Disable CellEditing" checkbox does:

```javascript readonly
myGrid.getPlugin('grid-cell-editing').disabled = true;
```

### Accessibility

While a grid edits, the cells of its columns that cannot be edited carry `aria-readonly="true"`, and the editable ones
carry nothing. The marks follow the configuration: a column turned non-editable at runtime is read-only in every
rendered row, and a disabled or destroyed plugin leaves no cell read-only.

## Exporting and Reading Cell Values

A buffered grid renders only a window of its rows. The rows outside the window are not in the DOM, and the cells that are
rendered hold markup made for display: a formatted date, a badge, a link. Reading either one back gives you a part of
the data in a shape nobody asked for. So the grid never exports from the DOM. It reads the store, which holds every
record, and it reads it the same way each time.

That read is one value walk, `getCellValues()`. It returns cells as values, one array per record. `toCsv()` serializes
that walk to text, and `exportCsv()` hands the text to the browser as a download. Because every reader goes through the
same walk, a CSV file, the clipboard, a spreadsheet writer and an agent all get the same value for the same cell.

### CSV Text with `toCsv()`

`toCsv()` returns the grid's CSV as a String. It does not download anything, so you can show it, copy it or send it to a
server.

```javascript readonly
myGrid.toCsv();                        // 'Name,Revenue\r\nAda,10\r\n…'
myGrid.toCsv({delimiter: ';'});        // the same text, with ';' between fields
myGrid.toCsv({header: false});         // rows only
myGrid.toCsv({escapeFormulas: false}); // formula-like strings unchanged
```

It takes three options.

| Option | Default | What it does |
|---|---|---|
| `delimiter` | `','` | The field separator. Use `';'` for spreadsheets in locales that write a decimal comma. |
| `escapeFormulas` | `true` | Prefixes a leading `'` to string cells that start with `=`, `+`, `-`, `@`, a tab or a CR. |
| `header` | `true` | Writes a first line with each column's header text, or its `dataField` when it has none. `false` omits it. |

`escapeFormulas` exists because a spreadsheet runs a cell that starts with `=` as a formula, and the text in your store
may have come from a user. With the prefix, the spreadsheet shows the text and runs nothing. Numbers are never prefixed,
so `-5` stays `-5`. Set `escapeFormulas: false` only when the file is for a reader that is not a spreadsheet: it writes
formula-like strings unchanged.

What ends up in the text follows from the walk:

- **Rows.** One line per store record, in the store's current filter and sort. Rows the grid has not rendered are
  included. The store holds the data, and the rendered rows are only a window onto it.
- **Columns.** The grid's columns in display order: locked start, center, then locked end. Only a column with a
  `dataField` is included, in `dataFields` order.
- **Cells.** The value `getCellValues()` yields in `export` mode: `record.get(dataField)`, or the return value of the
  column's `exportRenderer({record, value})` when it has one.

Quoting follows RFC 4180. A field that contains the delimiter, a double quote, a CR or an LF is wrapped in double
quotes, and its inner quotes are doubled. Lines are separated by CRLF, with no line break after the last one. A `Date` becomes an ISO 8601 string, and `null`
or `undefined` becomes an empty field.

### Downloading with `exportCsv()`

`exportCsv()` builds the same text and downloads it as a file. It takes the `toCsv()` options plus `fileName`, which
defaults to `'export.csv'`. It is async, and the Promise resolves `true` once the browser has the download.

```javascript readonly
await myGrid.exportCsv({fileName: 'revenue.csv', delimiter: ';'});
```

A grid lives in the App Worker, and a worker has no DOM, so it cannot start a download. `exportCsv()` therefore sends
the text to `Neo.main.addon.FileDownload` on the main thread of the grid's window. The addon wraps it in a Blob and
clicks a hidden anchor that carries `download`. That works in every browser, and it shows no file picker and asks for no
permission.

You set nothing up. The addon loads on demand the first time you export, so an app that never exports never loads it,
and you do not register it as a main-thread addon.

### Exported Values with `exportRenderer`

A column's `renderer` returns markup for the screen. Markup is the wrong thing to put in a file, so a `renderer` is
never exported. Without an `exportRenderer`, a cell exports the record's value, `record.get(dataField)`. A dotted
`dataField` such as `address.city` exports the nested value.

A column whose exported value needs formatting sets `exportRenderer`. It receives `{record, value}`, and what it
returns replaces the record's value for that cell.

```javascript readonly
columns: [{
    dataField: 'revenue',
    text     : 'Revenue',

    // Display: markup, null-safe
    renderer: ({value}) => value == null ? '' : `<span class="revenue">$${value.toFixed(2)}</span>`,

    // Export: plain text, so the file holds `12.50` or `n/a`, never a `<span>`
    exportRenderer: ({value}) => value == null ? 'n/a' : value.toFixed(2)
}]
```

### Reading Cells with `getCellValues()`

`getCellValues()` returns the cells of the grid as values: `values[rowIndex][columnIndex]`, one array per record and
one value per column.

```javascript readonly
myGrid.getCellValues();                                          // every record × every column
myGrid.getCellValues({dataFields: ['name'], records: [record]}); // [['Ada']]
```

| Option | Default | What it does |
|---|---|---|
| `dataFields` | `myGrid.dataFields` | The columns to read, in the order given. |
| `mode` | `'export'` | How a cell turns into a value. See the table below. |
| `records` | `myGrid.store.items` | The rows to read, in the order given. Every store record, in the current filter and sort order. |

`myGrid.dataFields` is a read-only getter. It holds the `dataField` of every column that has one, in display order:
locked start, center, locked end. Because `getCellValues()` reads these by default, `values[row][column]` maps back to
a column. Pass `dataFields` and `records` to read just a part of the grid; the values come back in the order given.
`records` accepts records, or raw row objects when the store runs in Turbo Mode.

The default `mode` is `'export'`. There are two modes, and any other mode throws an `unknown mode` error.

| Mode | The value of a cell |
|---|---|
| `'export'` (default) | The column's `exportRenderer` result when it has one, else the record's value. `undefined` becomes `null`, and an object or array that is not a `Date` becomes its JSON text. The result holds only strings, numbers, booleans, dates and `null`, which is what a serializer formats. A `dataField` that no column carries yields `null`. |
| `'raw'` | The record's value, untouched. `exportRenderer` is ignored, objects stay objects and dates stay `Date` instances. A `dataField` that no column carries yields `undefined`. |

In `'raw'` mode, a raw Turbo Mode row is not turned into a record. The store resolves the requested model fields on a
copy, so the column reads what the row's record holds.

`toCsv()` is this walk, serialized. A reader that needs a different value adds an `exportRenderer` to the column. It
does not walk the records itself.

## Performance and Big Data

The grid is designed for exceptional performance, especially when dealing with large datasets. Its virtual rendering
engine ensures that only the visible parts of the grid (rows and columns) are rendered in the DOM, significantly
reducing memory consumption and improving rendering speed.

### Optimizing Virtual Rendering

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

### Loading a Corpus Window by Window

A grid over a corpus too large to load at once appends windows as the reader scrolls. The body announces the moment
for that: `scrollEdge` fires once each time the visible window reaches the store's last `bufferRowRange` rows, and
again only after the store's visible count changes, so a viewport parked at the end stays quiet, an appended window
that still touches the end announces once more, and a window a filter hides entirely does not: the viewport saw nothing
move, and a grid that re-requested on hidden data would walk a filtered corpus with no gesture. The event carries the
store's `total` behind its filters for consumers that want to show it. Listen on the body, request the next window, and
append it to the store:

```javascript readonly
myGrid.body.on('scrollEdge', async ({total}) => {
    // the next window starts after every row the store HOLDS, filtered ones included — `total`,
    // never the visible `count` (with 11 held and 1 visible, `count` would re-request from 1)
    const next = await loadWindow({offset: total}); // your own source; it says when nothing follows

    next.rows.length > 0 && myGrid.store.add(next.rows)
});
```

The event carries no promise of more rows; that is the source's to state. Dedupe requests in flight on your side
if the source answers slowly.

### Row Height

The `rowHeight` config on the `Neo.grid.Container` plays a crucial role in the grid's rendering calculations. Ensuring
an accurate `rowHeight` is essential for the virtual rendering engine to correctly determine the number of visible rows
and the scrollable area. While the default value of `32px` is often suitable, you should adjust it if your grid rows
have a different fixed height.

The `examples/grid/bigData` example showcases the grid's performance with a large dataset, allowing you to
dynamically adjust the number of rows and columns.
