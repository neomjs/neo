---
seoTitle: "Building Kanban Boards | Neo.mjs"
seoDescription: "Learn how to build a kanban board with Neo.board.Container: columns projected from one store, swimlanes, card moves through moveCard, card items, and long columns."
---
# Building Kanban Boards

The `Neo.board.Container` (`ntype: 'board'`) shows the records of one store as cards in columns and, optionally,
in swimlanes. It extends `Neo.container.Base`. The board owns no card state of its own: the records are the truth,
and the columns are a view of them.

## 1. What a Board Is in Neo.mjs

A board is not a set of hand-built lists that you keep in sync. It is a projection of one `Neo.data.Store`:

- **A card is a record:** Each card renders one record of the board's `store`, usually a `Neo.board.CardModel`.
- **A column is a query:** A column holds the records whose `statusField` (default `'status'`) equals the column's
  `status`, sorted by `orderField` (default `'order'`).
- **A move is one record change:** Dragging a card, moving it with the keyboard, saving it in the card editor, or
  calling `moveCard()` from code all end in one `record.set()` that writes the new status and order together.

Because the move is a record change, every other view bound to the same store follows it with no wiring. The
[board example](https://github.com/neomjs/neo/blob/dev/examples/board/basic/Viewport.mjs) shows this: a board and a
grid both bind the same store through a state provider, and a card dragged to another column updates the grid row of
that record.

## 2. A Minimal Board

A working board needs a store of cards and, optionally, the list of its columns:

```javascript
import Board     from '../../../src/board/Container.mjs';
import CardModel from '../../../src/board/CardModel.mjs';
import Viewport  from '../../../src/container/Viewport.mjs';

const cards = [
    {id: 1, title: 'Design the login form', status: 'backlog',     tags: ['ux']},
    {id: 2, title: 'Build the search box',  status: 'backlog',     tags: ['frontend']},
    {id: 3, title: 'Review the export',     status: 'in-progress', tags: ['qa'],   assignees: ['Avery'], progress: 40},
    {id: 4, title: 'Test the settings',     status: 'in-progress', tags: ['qa'],   assignees: ['Blake'], progress: 70},
    {id: 5, title: 'Ship the onboarding',   status: 'done',        tags: ['docs'], assignees: ['Casey'], progress: 100}
];

class MainViewport extends Viewport {
    static config = {
        className: 'MyApp.view.MainViewport',
        layout   : {ntype: 'fit'},
        items    : [{
            module   : Board,
            reference: 'board',
            store    : {model: CardModel, data: cards},
            columns  : [
                {status: 'backlog',     title: 'Backlog'},
                {status: 'in-progress', title: 'In progress', wipLimit: 2},
                {status: 'done',        title: 'Done'}
            ]
        }]
    }
}

export default Neo.setupClass(MainViewport);
```

The cards have no `order` yet. When the board first projects, it gives every record without a numeric order one
inside its column, in store order, so a fresh data set needs nothing extra.

`Neo.board.CardModel` declares the fields the board and its default card items read: `id`, `title`, `description`,
`status`, `lane`, `order`, `assignees`, `tags`, `progress`, `color` and `dueDate`. You may bring your own model
instead. The board reads the field names it needs from `statusField`, `orderField` and `laneField`, so a model with a
`state` field works with `statusField: 'state'`.

To share the store with other views, put it on a state provider and bind it. This excerpt is from the example's
`Viewport.mjs`:

```javascript
stateProvider: {
    module: StateProvider,
    stores: {cards: {module: MainStore}}
},

items: [{
    module: BoardContainer,
    bind  : {store: 'stores.cards'},
    columns
}]
```

## 3. Columns

There are two ways to get columns:

- **Derived:** With `columns: null` (the default), the board creates one column per distinct status value in the
  store, in first-seen order, titled by the status itself.
- **Explicit:** A `columns` array fixes the order and the titles, and keeps a column on screen even while it has no
  cards.

Each entry of `columns` takes `status` and, optionally:

| Config | Default | Effect |
|---|---|---|
| `title` | the status | The header text. |
| `wipLimit` | `null` | A work-in-progress limit. The header badge shows `count/limit`, and a count above the limit marks the column with `neo-board-column-wip-exceeded`. Drops are not blocked. |
| `collapsed` | `false` | Hides the body and narrows the column to its header and count. A collapsed column stays a drop target. Users toggle it from the header. |
| `color` | `null` | A CSS color for the column's accent. |
| `locked` | `false` | Keeps the column at its index: its header shows a lock glyph and cannot be dragged. |
| `maxRenderedCards`, `overscan`, `retainOffscreen` | `100`, `10`, `null` | See section 7. |

Users reorder unlocked columns by dragging their headers (`columnsResortable`, `true` by default). The board writes
the new order back to `columns` and fires `columnMove` with `{status, laneValue, fromIndex, toIndex}`. Code can do
the same with `board.moveColumn(fromIndex, toIndex)`.

```javascript
columns: [
    {status: 'backlog',     title: 'Backlog',     locked: true},
    {status: 'ready',       title: 'Ready'},
    {status: 'in-progress', title: 'In progress', wipLimit: 5},
    {status: 'review',      title: 'Review',      wipLimit: 3},
    {status: 'done',        title: 'Done',        collapsed: true}
]
```

### Column summaries

To see the value of work in each column, declare the amount on your card model and configure the board's
`columnSummary`. For example, a sales board can total the amount of its visible deals:

```javascript
class DealModel extends CardModel {
    static config = {
        className: 'MyApp.model.Deal',
        fields   : [{name: 'amount', type: 'Float'}]
    }
}

const boardConfig = {
    module: Board,
    store : {model: Neo.setupClass(DealModel), data: [
        {id: 1, title: 'North', status: 'backlog', amount: 1200},
        {id: 2, title: 'South', status: 'backlog', amount: 800}
    ]},
    columnSummary: {
        field    : 'amount',
        formatter: sum => `$${sum.toFixed(2)}`
    }
};
```

The Backlog summary is `$2000.00`. The board sums finite numeric values for each status and, when swimlanes are
enabled, each lane/status intersection. It uses records remaining after the current store filters, including cards
outside the rendered window. An empty column sums to zero. The
formatter returns plain text for the header.

## 4. Swimlanes

Swimlanes add a second axis. Set `laneField` to the record field that names a card's lane, and the board switches
from one row of columns to one `Neo.board.LaneRow` per lane, each holding the full set of columns:

```javascript
{
    module   : Board,
    store    : {model: CardModel, data: cards},
    columns,
    laneField: 'lane',
    lanes    : [
        {value: 'web',    title: 'Web'},
        {value: 'mobile', title: 'Mobile', collapsed: true}
    ]
}
```

- **`lanes`:** Optional. Without it (`null`), the board derives one lane per distinct `laneField` value in first-seen
  order. With it, the listed lanes come first in that order, and any value the list does not name still gets a row
  after them. Each entry takes `value`, `title` and `collapsed`.
- **The unassigned lane:** Records whose lane value is `null` or missing land in one extra row with `value: null`,
  titled by `emptyLaneTitle` (`'Unassigned'` by default).

`CardModel` declares `lane` with a default of `null`, so a store that never sets it shows the unassigned lane only.
With `laneField: null` (the default), the board is a single row.

## 5. Moving Cards

All moves go through one method, `moveCard()`. The drag zone, the keyboard, the card editor and an agent all call it,
so a move from any source behaves the same.

- **Drag:** `dragResortable` (`true` by default) lets users drag cards within a column and across columns and lanes.
  It is independent of `columnsResortable`.
- **The keyboard:** `Neo.board.SelectionModel` is on by default. `Up`, `Down`, `Home` and `End` move the focus inside
  a column, and `Left` and `Right` move it to the nearest open column that holds cards. `Space` toggles selection, `Shift+Up` and
  `Shift+Down` extend it, `Ctrl+A` selects the column and `Escape` clears it. `Ctrl+Up`, `Ctrl+Down`, `Ctrl+Left` and
  `Ctrl+Right` move the focused card.
- **Code and agents:** Call `moveCard()` with the record (or its `key`, or the `cardId` of its card) and the target:

```javascript
// Inside the viewport of section 2: `reference: 'board'` finds the board
const board = this.getReference('board');

// To the top of "Done"
board.moveCard({key: 5, status: 'done', index: 0});

// In front of card 3, writing another field in the same set
board.moveCard({key: 1, status: 'in-progress', beforeId: 3, fields: {assignees: ['Devon']}});
```

The target position resolves from `beforeId`, then `afterId`, then `index`. Without any of them, the card goes to the
end of the column. `status` defaults to the record's current status, so a call with only `index` reorders the card
inside its column. With lanes, `lane` picks the target lane, `lane: null` picks the unassigned lane, and leaving it
out keeps the current one. The method returns the moved record, or `null` when the record or the target column does
not exist.

An agent on the Neural Link calls the same method on the board, addressing the card by key. Board ids are stable
(`<board>__col__<status>`, with `__<lane>` added when lanes are on, and `<board>__card__<key>`), so no index is
needed:

```javascript
call_method(boardId, 'moveCard', [{key: 5, status: 'review', index: 0}])
```

To react to moves, listen to the board's events:

```javascript
listeners: {
    cardMove({record, from, to}) {
        console.log(`${record.title}: ${from.status} -> ${to.status} at ${to.index}`);
    },
    cardsMove({records, status}) {
        console.log(`${records.length} cards dropped on ${status}`);
    },
    selectionChange({records}) {
        console.log(`${records.length} cards selected`);
    }
}
```

`cardMove` fires after each `moveCard()` with the `changes`, the `previous` values and both ends (`from` and `to`,
each `{status, lane, index}`). When several selected cards are dropped together, each one fires `cardMove`, and `cardsMove` then fires once with
`{records, status, laneValue}`.

## 6. What a Card Shows

`cardItems` lists what every card renders, in order. The default is
`[{type: 'title'}, {type: 'tags'}, {type: 'progress'}, {type: 'dueDate'}, {type: 'avatars'}]`. The built-in types are:

- `title`: the title line (field `title`).
- `text`: any text field; set `field`.
- `tags`: tag chips (field `tags`).
- `progress`: a bar over a 0 to 100 value (field `progress`). No value, or zero, draws no bar.
- `dueDate`: the due date as a `<time>` badge (field `dueDate`, an ISO date string or `Date`).
- `avatars`: the initials of each assignee (field `assignees`, names or objects with a `name`).

Each item may name another `field`. An item that finds nothing in its field renders nothing, so a backlog card
without assignees shows no empty avatar row. A record's `color` paints the card's accent.

```javascript
cardItems: [
    {type: 'title'},
    {type: 'text', field: 'description'},
    {type: 'avatars'}
]
```

To add a type of your own, register a renderer with `registerCardItem(type, renderer)` from
`src/board/CardItems.mjs`. The renderer receives `(record, item, card)` and returns one vdom node, or `null`.

The [card designs example](../../../examples/board/cardDesigns/Viewport.mjs) changes `cardItems` on the same board.
Its Compact, Standard and Detailed choices form a single-choice [segmented button group](../../../src/button/Segmented.mjs).
The example imports `Segmented` from `../../../src/button/Segmented.mjs` and uses `module: Segmented`.
Once the module is loaded, declarative configs can use `ntype: 'segmented-button'` for the same segmented control.
Give the control an `ariaLabel` and an ordered `choices` array of `{value, text, disabled?}`. Bind its `value` or
listen for `change({value, oldValue})`. A programmatic selection follows the same path as a click. Arrow keys move
focus between enabled buttons, and Enter or Space selects one. Replacing the choices preserves the selection if it
is still enabled, otherwise the first enabled choice becomes active. With no enabled choices the value is `null`.

**The card editor:** Double-clicking a card or pressing `Enter` on the focused card fires `cardActivate` with
`{card, record}` and opens the board's one shared `Neo.board.CardEditor` dialog. The card's menu button opens the same
dialog. The form follows
the board's model: it builds the fields the model declares (title and status always). Saving writes all changed
fields in one `record.set()`, and a changed status or lane goes through `moveCard()`, so the card lands at the end of
its new column. Cancel or `Escape` writes nothing. Double-clicking the title alone, or pressing `F2`, edits the title
inline. Code opens the editor with `board.openCardEditor(recordOrKey)`, and `cardEditorConfig` passes options, such
as the `fields` to show:

```javascript
cardEditorConfig: {fields: ['title', 'status', 'assignees']}
```

## 7. Long Columns

A column with many cards does not render them all. Each column renders a window of its records and creates more cards
as the user scrolls:

- **`maxRenderedCards`** (default `100`): when a column holds more records than this, it renders a window of that
  size. `null` renders every card.
- **`overscan`** (default `10`): extra cards rendered with the window, in total, so scrolling does not show gaps.
- **`retainOffscreen`** (default `null`): how many offscreen cards a sliced column keeps alive; `null` keeps up to one
  window.

All three are column configs, so they go on the entries of `columns`:

```javascript
columns: [
    {status: 'backlog', title: 'Backlog', maxRenderedCards: 50, overscan: 20},
    {status: 'done',    title: 'Done',    maxRenderedCards: null}
]
```

A record outside the window has no card, so `board.getCard(key)` returns `null` for it. The record is still in the
store: `moveCard({key})` still moves it, and `column.scrollToRecord(key)` brings it into view. Selection and keyboard
focus follow record keys, so they survive the scrolling too.

## 8. Where to Go Next

To see a sprint board with WIP limits and a grid that shares its store, read the
[Board Basic Example source](https://github.com/neomjs/neo/blob/dev/examples/board/basic/Viewport.mjs) and its
[store](https://github.com/neomjs/neo/blob/dev/examples/board/basic/MainStore.mjs).

For related component families:
- The [Resource Schedulers guide](Scheduler.md) applies the same idea, one store and an edit that is a record change,
  to bookings on a time axis.
- The [Gantt Charts & Linked Tasks guide](Gantt.md) adds task trees and dependency links on top of the scheduler.
- The [Using data.Store guide](UsingStores.md) and the [State Providers guide](StateProviders.md) cover the store and
  how several views bind one.
