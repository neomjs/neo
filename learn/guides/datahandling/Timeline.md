---
seoTitle: "Using a Timeline Column in a Grid | Neo.mjs"
seoDescription: "Learn how to add a timeline column to an existing Neo.mjs grid, connect event records to resource rows, configure the time axis, and render interactive timeline bars."
---

# Using a Timeline Column in a Grid

You already have a grid of resources, projects, people, or machines. Now you need to see when work happens alongside the information you already display.

A conventional grid answers *what belongs to each row*. A timeline adds another question: *when does it happen?*

You do not need to replace your grid with a scheduler to answer that question. Neo.mjs provides `Neo.timeline.Column`, a grid column that projects time-based records into horizontal bars inside the corresponding row. Your existing resource columns remain ordinary grid columns; the timeline becomes another column in the same layout.

## 1. What a Timeline Column adds

`Neo.timeline.Column` extends `Neo.grid.column.Base`. It turns a row's time-based data into bars positioned against a shared `Neo.timeline.TimeAxis`.

This is useful when a timeline is one part of a larger tabular view. For example, a project grid can keep its owner, status, and priority columns while adding a schedule next to them. A machine inventory can show machine details and operating intervals in the same row.

The relationship looks like this:

```mermaid
flowchart TD
    Resources["Grid store<br/>Resource rows"]
    Grid["Neo.grid.Container"]
    Events["Neo.timeline.store.Events<br/>Event records"]
    Axis["Neo.timeline.TimeAxis<br/>Date range and scale"]
    Column["Neo.timeline.Column"]
    Bars["Timeline bars<br/>inside matching rows"]

    Resources --> Grid
    Grid --> Column
    Events --> Column
    Axis --> Column
    Column --> Bars
```

The grid owns the rows. The event store supplies the intervals, and the time axis supplies their horizontal coordinates. The column projects the relevant events into each row.

Use a Timeline Column when you want a timeline alongside the other columns in an existing grid. Start with the [Resource Schedulers guide](Scheduler.md) when the central purpose of the view is a complete resource-booking experience with dedicated booking interactions. The two approaches share the timeline primitives; they serve different starting points.


## 2. A minimal grid with a Timeline Column

A working timeline needs a grid store containing resource rows, a `Neo.timeline.TimeAxis` defining the visible time range, and an event store containing dated records associated with those rows.

The following minimal viewport creates a grid with a resource column and a Timeline Column backed by a time axis and an
event store. Open Preview to run it here.

```javascript live-preview
import GridContainer  from '../grid/Container.mjs';
import TimeAxis       from '../timeline/TimeAxis.mjs';
import TimelineColumn from '../timeline/Column.mjs';
import EventStore     from '../timeline/store/Events.mjs';
import Viewport       from '../container/Viewport.mjs';

const resources = [
    {id: 'r-1', name: 'Design Team'},
    {id: 'r-2', name: 'Core Engine'},
    {id: 'r-3', name: 'QA & Testing'}
];

const events = [
    {
        id: 'ev-1',
        resourceId: 'r-1',
        title: 'Sprint Planning',
        startDate: '2026-11-16T08:00:00Z',
        endDate: '2026-11-16T11:00:00Z'
    },
    {
        id: 'ev-2',
        resourceId: 'r-2',
        title: 'Architecture Sync',
        startDate: '2026-11-16T09:00:00Z',
        endDate: '2026-11-16T12:00:00Z'
    },
    {
        id: 'ev-3',
        resourceId: 'r-3',
        title: 'Integration Tests',
        startDate: '2026-11-16T10:00:00Z',
        endDate: '2026-11-16T14:00:00Z'
    }
];

class MainViewport extends Viewport {
    static config = {
        className: 'Neo.examples.timeline.basic.Viewport',
        layout   : {ntype: 'fit'},
        items    : [{
            module   : GridContainer,
            rowHeight: 56,
            store    : {
                model: {fields: [{name: 'id'}, {name: 'name'}]},
                data : resources
            },
            columns: [
                {
                    dataField: 'name',
                    text     : 'Resource',
                    width    : 180,
                    locked   : 'start'
                },
                {
                    module   : TimelineColumn,
                    ntype    : 'timeline-header',
                    dataField: 'timeline',
                    text     : 'Schedule',
                    timeAxis : {
                        module     : TimeAxis,
                        start      : '2026-11-16T00:00:00Z',
                        end        : '2026-11-17T00:00:00Z',
                        timeZone   : 'UTC',
                        tickUnit   : 'hour',
                        tickStep   : 2,
                        pxPerMinute: 1
                    },
                    eventStore: {
                        module: EventStore,
                        data  : events
                    }
                }
            ]
        }]
    }
}

export default Neo.setupClass(MainViewport);
```

The resource store defines the grid rows, while the event store supplies the timeline bars. Each event's `resourceId` associates it with the corresponding resource row.

The Timeline Column is configured like any other grid column. Its `timeAxis` and `eventStore` configurations are converted into their corresponding Neo instances.

## 3. Events and rows

The resource store and event store answer different questions.

The grid's `store` determines which rows exist and provides the fields shown by ordinary columns. In the example, each resource has an `id` and a `name`.

The `eventStore` contains `Neo.timeline.model.Event` records. Each event has an identifier, a title, start and end dates, and a `resourceId` identifying its owning row. The model also supports `description`, `allDay`, `cls`, and `percentDone`.

By default, the column reads the row's `id` through `resourceIdField: 'id'`. It finds events whose `resourceId` matches that value. This means the event's `resourceId` must correspond to the resource key used by the row.

If your rows use a different key, set `resourceIdField` to its field name. For example, a grid whose resource records use `machineCode` can match event records by configuring `resourceIdField: 'machineCode'` and putting the corresponding machine code in each event's `resourceId`.

Several events can belong to the same row. When their time intervals overlap, Neo packs them into separate vertical lanes inside that row. Independent, non-overlapping intervals can use the same lane. This makes simultaneous work visible without placing one bar directly over another.

There is also a second data shape: an inline row record. When no `eventStore` is configured, the column checks the row itself for `startDate` and `endDate`. It can read the title and completion percentage from that same record as well. This is useful when each row represents one task or interval rather than a resource with multiple events.

The inline field names are configurable through `startDateField`, `endDateField`, `titleField`, and `percentDoneField`. The event-store approach is the natural fit when one resource row can own multiple independently managed events.

## 4. The time axis and its header

`Neo.timeline.TimeAxis` defines the temporal range and translates dates into horizontal positions. Its `start` and `end` establish the interval represented by the column.

The scale can be controlled with `pxPerMinute`: a higher value gives each minute more horizontal space. An explicit `size` can instead provide a fixed total width for the complete range. Choose a scale that makes the intervals readable without making the grid unnecessarily wide.

The axis also controls tick generation. `tickUnit` accepts `minute`, `hour`, `day`, `week`, or `month`; `tickStep` determines how many units separate ticks. In the example, `hour` with a step of `2` produces two-hour ticks.

Snapping controls editing precision, not the display frequency of the header ticks. `snapMinutes` sets the interval to which pointer-derived dates are snapped, relative to the time axis start. It defaults to 15 minutes; configure a different value when your application needs a coarser or finer editing interval. When an event is moved or resized, the drag zone converts the pointer position into a date and snaps it before calculating the updated interval.

Set `timeZone` deliberately when your application has a defined calendar zone. The example uses `UTC` and ISO timestamps ending in `Z`, so its event instants and axis calendar use the same reference. When no time zone is provided, the axis uses the viewer's local calendar.

The timeline header has two rows. The major row provides the broader time grouping, while the minor row displays the finer ticks. `majorTickUnit` and `majorTickStep` can override the major row's automatic unit, and `majorFormatter` and `minorFormatter` let you customize the corresponding labels. When no major unit is set, the header derives it from the axis tick unit.

For working calendars, the axis supports `nonWorkingDays` and `nonWorkingDates`. The default non-working weekdays are Sunday and Saturday; pass an empty array for `nonWorkingDays` when every weekday should count as working time. Set `showNonWorkingTime` on the Timeline Column to display the corresponding shaded ranges in its track and header.

## 5. Bars: content, styling, progress, and changes

Each event is represented by a bar positioned from its start and end dates. The default label comes from `titleField`, which uses `title` by default.

Use `barCls` to add a CSS class to the column's bars, or `cls` on an individual event to style that event differently. For more involved rendering, `barRenderer` receives a bar descriptor and a context containing the column and its virtual DOM node. It can return a replacement VDOM object or a string to use as the bar label.

When an event has a positive `percentDone` value, the column renders a progress fill inside the bar. Values are clamped to the `0..100` range for the fill width. `highlightedRecordIds` can mark selected event record IDs with the highlighted bar class.

Bar resizing is enabled by default through `resizableBars`. The column renders start and end handles, and the timeline drag zone handles moving and resizing intervals. On drop, the drag zone commits the pending dates through `owner.commitTimelineEdit()` when the owner provides it. Otherwise, it updates the event record with `record.set()` (or assigns the updated properties to a plain object) and asks the store to sort. A cancelled drag clears the pending drop, leaving the original record unchanged.

The [full basic Timeline example](https://github.com/neomjs/neo/blob/dev/examples/timeline/basic/Viewport.mjs) demonstrates the same data principle without a pointer gesture: its toolbar handler finds an event and calls `event.set()` with new `startDate` and `endDate` values. The store and grid continue to work with the updated record rather than a separate, manually maintained drawing.

## 6. Where to go next

To explore the complete implementation, including toolbar controls and record updates, see the [basic Timeline example source](https://github.com/neomjs/neo/blob/dev/examples/timeline/basic/Viewport.mjs).

For a complete resource-booking experience, continue with the [Building Resource Schedulers](Scheduler.md) guide. For hierarchical project plans with linked tasks, see [Gantt Charts & Linked Tasks](Gantt.md).
