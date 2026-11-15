---
seoTitle: "Building Gantt Charts with Linked Tasks | Neo.mjs"
seoDescription: "Learn how to build interactive Gantt charts with Neo.gantt.Container: hierarchical task trees, dependency records, cascade propagation, and working calendars."
---
# Building Gantt Charts with Linked Tasks

The `Neo.gantt.Container` is a specialized application component for scheduling, visualizing, and maintaining hierarchical work breakdowns across a continuous time axis. It extends `Neo.scheduler.Container` and unifies an interactive tree grid with a high-performance timeline that projects task durations, progress fills, milestones, and directed dependency linkages.

## 1. What a Gantt Chart Is in Neo.mjs

In the Neo.mjs architecture, a Gantt chart is not an ad-hoc visual overlay or an assortment of loosely tracked DOM elements. Instead, the chart is driven by two coordinated, observable data stores:

- **The Task Tree (`store`):** An instance of `Neo.gantt.TaskStore` (which extends `Neo.data.TreeStore`) holding hierarchical `Neo.gantt.TaskModel` records. Tasks form a tree structure representing project milestones, parent summary phases, and leaf work items.
- **The Dependency Graph (`dependencyStore`):** An instance of `Neo.gantt.DependencyStore` (extending `Neo.data.Store`) holding directed `Neo.gantt.DependencyModel` records. Each dependency links a predecessor task to a successor task.

Because `Neo.gantt.Container` inherits from `Neo.scheduler.Container` and `Neo.grid.Container`, the component splits its viewport into two synchronized views:
1. A locked tree column area defined by `taskColumns` (anchored to the start edge) that displays hierarchical task titles and attributes.
2. A timeline body governed by `timeAxis` that renders interactive task bars, milestones, and dependency vectors.

Every modification to either store—whether performed through mouse or touch gestures, inline cell editors, or direct record mutation—triggers reactive updates across both views.

## 2. A Minimal Chart

A functional Gantt chart can be mounted directly with inline configurations for tasks and dependencies. The minimal example below defines a parent summary phase with three sequential child tasks and Finish-to-Start dependencies:

```javascript
import DependencyStore from '../../../src/gantt/DependencyStore.mjs';
import Gantt           from '../../../src/gantt/Container.mjs';
import TaskStore       from '../../../src/gantt/TaskStore.mjs';
import Viewport        from '../../../src/container/Viewport.mjs';

const tasks = [
    {id: 'phase1', parentId: null,     isLeaf: false, collapsed: false, title: 'Phase 1: Foundation', startDate: '2026-11-09T00:00:00Z', endDate: '2026-11-14T00:00:00Z'},
    {id: 'task1',  parentId: 'phase1', isLeaf: true,  title: 'Site Survey',          startDate: '2026-11-09T00:00:00Z', endDate: '2026-11-10T00:00:00Z'},
    {id: 'task2',  parentId: 'phase1', isLeaf: true,  title: 'Architectural Blueprint', startDate: '2026-11-10T00:00:00Z', endDate: '2026-11-12T00:00:00Z'},
    {id: 'task3',  parentId: 'phase1', isLeaf: true,  title: 'Material Procurement',   startDate: '2026-11-12T00:00:00Z', endDate: '2026-11-14T00:00:00Z'}
];

const dependencies = [
    {id: 'dep-1-2', fromId: 'task1', toId: 'task2', type: 'FS', lag: 0, lagUnit: 'hour'},
    {id: 'dep-2-3', fromId: 'task2', toId: 'task3', type: 'FS', lag: 0, lagUnit: 'hour'}
];

class MainViewport extends Viewport {
    static config = {
        className: 'MainViewport',
        layout   : {ntype: 'fit'},
        items    : [{
            module             : Gantt,
            reference          : 'gantt',
            editable           : true,
            rowHeight          : 56,
            store              : {module: TaskStore, data: tasks},
            dependencyStore    : {module: DependencyStore, data: dependencies},
            cascadeDependencies: true,
            taskColumns        : [{type: 'tree', dataField: 'title', text: 'Task Name', width: 220, locked: 'start'}],
            timeAxis           : {
                start      : '2026-11-09',
                end        : '2026-11-20',
                timeZone   : 'UTC',
                tickUnit   : 'day',
                pxPerMinute: 0.12,
                snapMinutes: 60
            },
            listeners: {
                taskChange: 'up.onTaskChange'
            }
        }]
    }

    onTaskChange(data) {
        // Handle persisted updates when tasks move or resize
    }
}

export default Neo.setupClass(MainViewport);
```

## 3. The Task Record

The data model for tasks is `Neo.gantt.TaskModel`. It extends `Neo.data.TreeModel` and incorporates timeline fields:

- **`id` (String | Number):** Unique record identifier.
- **`parentId` (String | Number | null):** References the parent task's `id`. Summary tasks at the root level specify `parentId: null`.
- **`isLeaf` (Boolean):** Set to `false` for parent phases and `true` for individual work packages.
- **`collapsed` (Boolean):** Controls the expansion state of child nodes in the tree column (defaults to `false`).
- **`startDate` & `endDate` (Date | String):** ISO date strings or Date objects specifying the start and completion instants.
- **`duration` (Number) & `durationUnit` (String):** Explicit span length (defaults to `'hour'`).
- **`milestone` (Boolean):** When `true`, indicates a point-in-time milestone rendered as a diamond glyph rather than an extended bar.
- **`percentDone` (Number):** Completion percentage from `0` to `100`, visually rendered as an interior progress fill on the task bar.

Tasks are updated reactively using model setters. For example, moving a task by one day:

```javascript
const task = gantt.store.get('task1');
task.set({
    startDate: '2026-11-10T00:00:00Z',
    endDate  : '2026-11-11T00:00:00Z',
    percentDone: 45
});
```

Because `TaskStore` is a hierarchical tree store, folding or unfolding summary nodes through `task.set({collapsed: true})` automatically toggles child row visibility in both the grid and timeline areas.

## 4. The Dependency Record

Precedence constraints between tasks are defined by `Neo.gantt.DependencyModel` records in `dependencyStore`. Each dependency specifies:

- **`id`:** Unique record identifier for the dependency link.
- **`fromId`:** Identifier of the predecessor task.
- **`toId`:** Identifier of the successor task.
- **`type`:** Precedence constraint type (`'FS'`, `'SS'`, `'FF'`, `'SF'`). Defaults to `'FS'`.
- **`lag`:** Signed numeric offset (defaults to `0`).
- **`lagUnit`:** Measurement unit for lag (`'minute'`, `'hour'`, `'day'`). Defaults to `'minute'`.

The cascade engine (`Neo.gantt.Cascade`) handles four relationship types:

| Link Type | Name | Successor Constraint | Real-World Use Case |
| :--- | :--- | :--- | :--- |
| **`FS`** | Finish-to-Start | Successor starts at or after predecessor completion (+ lag). | Standard sequential tasks: building walls begins after pouring foundation. |
| **`SS`** | Start-to-Start | Successor starts at or after predecessor start (+ lag). | Parallel workflows: structural inspection begins when excavation begins. |
| **`FF`** | Finish-to-Finish | Successor finishes at or after predecessor finish (+ lag). | Coordinated delivery: documentation writing finishes when QA testing finishes. |
| **`SF`** | Start-to-Finish | Successor finishes at or after predecessor start (+ lag). | Shift handovers: the legacy operations team departs when the new shift arrives. |

Dependencies can also be added or removed programmatically:

```javascript
gantt.dependencyStore.add({
    id     : 'dep-survey-arch',
    fromId : 'task1',
    toId   : 'task2',
    type   : 'FS',
    lag    : 4,
    lagUnit: 'hour'
});
```

A positive `lag` creates mandatory downtime between tasks, while a negative lag represents lead time where the successor starts prior to predecessor completion.

## 5. The Cascade

The cascade subsystem (`Neo.gantt.Cascade`) maintains schedule integrity whenever task dates change:

- **Automated Propagation:** When `cascadeDependencies: true` (the default setting), modifying a task's dates triggers downstream topological recomputation. Successors shift forward to respect incoming constraints or shift backward if preceding tasks conclude ahead of schedule.
- **Manual Scheduling:** Setting `cascadeDependencies: false` disables automated propagation. Predecessor adjustments leave successor dates unchanged, allowing manual timeline adjustments.
- **Cycle Detection:** When computing required dates, `Cascade` inspects incoming edges. If a circular loop is encountered, cycles are detected and broken in discovery order.

When a cascade completes, it returns an array of mutation descriptors:

```javascript
// Structure of cascaded adjustments emitted by Cascade
[
    {
        record      : taskRecord,
        dependencyId: 'dep-1-2',
        startDate   : nextStartDate,
        endDate     : nextEndDate,
        changes     : {startDate: nextStartDate, endDate: nextEndDate},
        previous    : {startDate: prevStartDate, endDate: prevEndDate}
    }
]
```

In the live example, advancing `Site Survey` by 24 hours automatically causes `Architectural Blueprint` and `Material Procurement` to shift forward by 24 hours in sequence. Disabling `cascadeDependencies` retains downstream tasks at their existing dates.

## 6. Working Time & Calendars

Real-world schedules frequently observe non-working days such as weekends and holidays:

- **`useWorkingTime: true`:** When enabled (defaults to `false`), durations and lags calculate against the calendar of `Neo.timeline.TimeAxis`.
- **`nonWorkingDays`:** An array of day indices on `timeAxis` (e.g. `nonWorkingDays: [0, 6]` for Saturday and Sunday).
- **Calendar Adjustments:** When active, tasks and lags that cross non-working intervals automatically stretch across the calendar without shortening the allocated working hours.
- **Snapping:** Using `snapMinutes` ensures tasks align cleanly to shifts or hour boundaries.

## 7. Interactive Links & Next Steps

`Neo.gantt.Container` provides direct gesture interaction for creating and adjusting links:

- **`dependencyCreation: true`:** Enables interactive link drag handles on task bars. Users can click and drag from the edge of a predecessor task to connect to a successor task. This configuration can also be supplied as a filter function `({fromTask, toTask, fromEdge, toEdge}) => boolean` to enforce domain-specific link rules.
- **`schedule` Service:** Applications can lend an optional schedule service to `Neo.gantt.Container` using the `schedule` configuration to intercept commits, provide multi-user synchronization, or validate enterprise business logic.

To inspect a complete application with local persistence, zoom presets, and interactive toolbar controls, see the runnable [Gantt Basic Example](../../../examples/gantt/basic/index.html). For related data patterns, explore the guides for [Grids](Grids.md) and [TreeStore](TreeStore.md).
