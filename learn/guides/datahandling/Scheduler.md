---
seoTitle: "Building Resource Schedulers | Neo.mjs"
seoDescription: "Learn how to build interactive resource schedulers with Neo.scheduler.Container: resource stores, event stores, time axes, and booking edits."
---
# Building Resource Schedulers

The `Neo.scheduler.Container` is an application component designed for allocating, visualizing, and adjusting event bookings against the records of a resource store across a continuous temporal axis. It extends `Neo.grid.Container` and combines locked resource columns with an interactive timeline column.

## 1. What a Scheduler Is in Neo.mjs

In Neo.mjs, a scheduler is not an unstructured drawing surface or a collection of disconnected DOM elements. It is an architectural fusion of a multi-body grid and a timeline:

- **Rows are records:** Each row represents a resource (such as a room, vehicle, or staff member) provided by the grid's primary `store` (`Neo.data.Store`).
- **Bars are records:** Each rendered bar represents a scheduled booking or event backed by an `eventStore` (`Neo.timeline.store.Events`), containing `Neo.timeline.model.Event` records.
- **An edit is a record change:** Modifying a booking—whether through mouse dragging, edge handle resizing, keyboard gestures, or modal dialog editing—commits directly through the model and store layer. Every commit validates date boundaries, updates reactive record fields via `record.set()`, and triggers an `eventChange` event.

Because `Neo.scheduler.Container` extends `Neo.grid.Container`, it partitions the display into two synchronized regions:
1. A locked start column region (`resourceColumns`) displaying tabular metadata for each resource.
2. A center timeline column (`Neo.timeline.Column`) driven by `timeAxis` (`Neo.timeline.TimeAxis`) that renders booking bars positioned precisely by start and end timestamps.

## 2. A Minimal Scheduler

A complete, runnable scheduler requires only a resource store, an event store, and a time axis configuration. Open
Preview to run it here, and drag a booking to another studio or time:

```javascript live-preview
import Scheduler from '../scheduler/Container.mjs';
import Viewport  from '../container/Viewport.mjs';

const rooms = [
    {id: 'r-1', name: 'Recording Studio'},
    {id: 'r-2', name: 'Mixing Suite'},
    {id: 'r-3', name: 'Rehearsal Room'}
];

const bookings = [
    {id: 'ev-1', resourceId: 'r-1', title: 'Quartet Recording', startDate: '2026-11-09T00:00:00Z', endDate: '2026-11-09T04:00:00Z'},
    {id: 'ev-2', resourceId: 'r-2', title: 'Score Mix',         startDate: '2026-11-09T05:00:00Z', endDate: '2026-11-09T08:00:00Z'},
    {id: 'ev-3', resourceId: 'r-3', title: 'String Rehearsal',  startDate: '2026-11-09T02:00:00Z', endDate: '2026-11-09T05:00:00Z'}
];

class MainViewport extends Viewport {
    static config = {
        className: 'MyApp.view.MainViewport',
        layout   : {ntype: 'fit'},
        items    : [{
            module         : Scheduler,
            reference      : 'scheduler',
            rowHeight      : 64,
            resourceColumns: [{dataField: 'name', text: 'Studio', width: 200, locked: 'start'}],
            store          : {model: {fields: [{name: 'id'}, {name: 'name'}]}, data: rooms},
            eventStore     : {data: bookings},
            timeAxis       : {
                start      : '2026-11-09',
                end        : '2026-11-11',
                timeZone   : 'UTC',
                tickUnit   : 'hour',
                tickStep   : 2,
                pxPerMinute: 0.5,
                snapMinutes: 30
            }
        }]
    }
}

export default Neo.setupClass(MainViewport);
```

## 3. The Two Stores and the Link Between Them

The scheduler balances two distinct data stores:

- **Resource Store (`store`):** Holds resource records. The scheduler inspects the field identified by `resourceIdField` (which defaults to `'id'`) on each record to establish the row identity. The resource store needs a model that names `id` and every field a resource column shows, ensuring the grid binds and maps records to rows.
- **Event Store (`eventStore`):** An instance of `Neo.timeline.store.Events` managing `Neo.timeline.model.Event` records.

Each event record defines canonical scheduling fields:

| Field | Type | Description |
|---|---|---|
| `id` | `String\|Number` | Unique primary key of the booking record. |
| `resourceId` | `String\|Number` | Identifier linking the booking to its owning resource row. |
| `title` | `String` | Text label displayed on the timeline bar. |
| `description` | `String` | Optional supplemental detail text. |
| `startDate` | `Date\|String` | Starting timestamp of the scheduled booking. |
| `endDate` | `Date\|String` | Concluding timestamp of the scheduled booking. |
| `allDay` | `Boolean` | Flag indicating whether the event spans full calendar days (default: `false`). |
| `cls` | `String\|null` | Optional CSS class applied to the rendered bar node. |
| `percentDone` | `Number` | Completion percentage (`0..100`) rendered as a progress bar fill. |

The scheduler matches events to rows using `resourceIdField`. For example, if your resource rows identify rooms via `roomId`, configure `resourceIdField: 'roomId'`. When rendering each row cell, `Neo.timeline.store.Events` resolves visible records for that row via its interval query methods:

```javascript
// Internal store resolution matching row resource keys to event resourceId values
store.getRangeRecords(axisStart, axisEnd, rowRecord[resourceIdField]);
```

## 4. The Time Axis: Range, Ticks, Snapping, and Non-Working Days

The `timeAxis` configuration instantiates `Neo.timeline.TimeAxis` (`src/timeline/TimeAxis.mjs`), which handles coordinate projection, viewport tick generation, and calendar constraints without reading the DOM:

- **`start` and `end`:** Boundary timestamps (`Date` objects, ISO strings, or timestamps) establishing the temporal range.
- **`timeZone`:** The calendar timezone (such as `'UTC'` or `'America/New_York'`) used for civil date calculations.
- **`tickUnit` and `tickStep`:** Defines header tick frequency. `tickUnit` accepts `'minute'`, `'hour'`, `'day'`, `'week'`, or `'month'`. `tickStep` specifies the unit multiplier (e.g. `tickUnit: 'hour', tickStep: 2` places a tick every two hours).
- **`pxPerMinute`:** Scale factor determining horizontal width per minute.
- **`snapMinutes`:** Snapping resolution (in minutes). When dragging or resizing a bar, dates automatically snap to multiples of this value (e.g. `15` or `30`).
- **`nonWorkingDays`:** Array of day-of-week indices (`0..6`, where `0` is Sunday and `6` is Saturday) designated as non-working. Defaults to `[0, 6]`. Pass `[]` to treat all seven days as working days.
- **`nonWorkingDates`:** Specific calendar dates (`['YYYY-MM-DD']`) treated as blackout dates or holidays.
- **`showNonWorkingTime`:** Setting `showNonWorkingTime: true` on the scheduler renders visual shading bands across both the timeline header and row bodies.

```javascript
timeAxis: {
    start          : '2026-11-09',
    end            : '2026-11-16',
    timeZone       : 'UTC',
    tickUnit       : 'day',
    tickStep       : 1,
    pxPerMinute    : 0.25,
    snapMinutes    : 30,
    nonWorkingDays : [0, 6]
}
```

## 5. Moving, Resizing, and Editing a Booking

User interactions with timeline bars are managed declaratively on `Neo.scheduler.Container`:

- **Pointer Drag (`barDraggable`):** Enabled by default (`barDraggable: true`). A user can click and drag any bar to move it across time or between different resource rows. Pressing `Escape` during a drag gesture safely aborts the operation without committing changes.
- **Edge Resizing (`resizableBars`):** Enabled by default (`resizableBars: true`). Renders `.neo-resizable-start` and `.neo-resizable-end` handles on either end of the bar.
- **`minimumDuration`:** Defines the smallest duration in minutes (default: `15`) allowed during interactive resize gestures, preventing invalid zero or negative duration records.
- **`enableResizingAcrossOppositeEdge`:** When `true` (the default), dragging a start handle past the end handle automatically flips the endpoints while preserving `minimumDuration`.
- **Built-in Dialog Editor (`editable`):** Enabled by default (`editable: true`). Double-clicking a bar or pressing Enter opens `Neo.timeline.EventEditor`, allowing modal edits to title, start date, end date, and resource assignment.
- **Listening to Changes:** Attach an `eventChange` listener to respond to committed changes. Its `changeSource` identifies the edit origin (`keyboard`, `drag`, `resize`, `editor`, or the caller's `meta.source`, defaulting to `api`); `source` remains the scheduler's component id:

```javascript
listeners: {
    eventChange({record}) {
        const {id, resourceId, title, startDate, endDate} = record;
        console.log(`Booking ${id} rescheduled for ${resourceId}:`, startDate, 'to', endDate);
    }
}
```

## 6. A Bar's Content with `barRenderer`

While `Neo.timeline.Column` supplies default DOM structures for bars, `barRenderer` offers a hook to customize bar content and styling:

```javascript
barRenderer: (bar, {vdom}) => {
    // Style bar based on resource id
    const colors = ['violet', 'emerald', 'amber'];
    const index  = (Number(String(bar.resourceId).split('-').pop()) - 1) % colors.length;
    vdom.cls.push(`neo-scheduler-bar-${colors[index]}`);

    // Optionally inject custom icons or secondary metadata into vdom.cn
    return vdom;
}
```

The hook receives `bar` (describing the event and its coordinates) and context `{vdom}` representing the virtual DOM node of the bar. You can append CSS classes, adjust inline styles, or insert nested child elements (e.g. status badges or icons).

## 7. Where to Go Next

To inspect a production-style implementation featuring local storage persistence, dynamic zoom presets, and interactive toolbar controls, explore the [Scheduler Basic Example source](https://github.com/neomjs/neo/blob/dev/examples/scheduler/basic/Viewport.mjs).

For related component families:
- Explore the [Grids guide](Grids.md) to learn about locked columns, row models, and cell rendering.
- Explore the [Gantt Charts & Linked Tasks guide](Gantt.md) for hierarchical project management: `Neo.gantt.Container` extends `Neo.scheduler.Container` with parent-child task trees (`Neo.gantt.TaskStore`), dependency links (`Neo.gantt.DependencyStore`), and automatic cascade updates.
