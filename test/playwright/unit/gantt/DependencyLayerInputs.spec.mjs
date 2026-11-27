import {expect, test} from '@playwright/test';
import {setup}        from '../../setup.mjs';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import DependencyLayer from '../../../../src/gantt/DependencyLayer.mjs';
import DependencyStore from '../../../../src/gantt/DependencyStore.mjs';
import GanttContainer  from '../../../../src/gantt/Container.mjs';
import TaskStore       from '../../../../src/gantt/TaskStore.mjs';
import TimeAxis        from '../../../../src/timeline/TimeAxis.mjs';

const appName = 'GanttDependencyLayerInputsTest';

setup({
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

class OverlayChart extends GanttContainer {
    static config = {
        className            : 'Test.Unit.Gantt.DependencyLayerInputs.OverlayChart',
        dependencyLayerConfig: {bufferPx: 800}
    }
}
class OverlayLayer extends DependencyLayer {
    static config = {className: 'Test.Unit.Gantt.DependencyLayerInputs.OverlayLayer'}
}
// A layer with an input of its own, and a chart that points its bufferPx relay at it
class OverscanLayer extends DependencyLayer {
    static config = {
        className: 'Test.Unit.Gantt.DependencyLayerInputs.OverscanLayer',
        overscan_: 0
    }
}
class OverscanChart extends GanttContainer {
    static timelineRelays = Neo.merge(Neo.clone(GanttContainer.timelineRelays, true), {bufferPx: {layer: 'overscan'}})

    static config = {
        className            : 'Test.Unit.Gantt.DependencyLayerInputs.OverscanChart',
        dependencyLayerConfig: {module: OverscanLayer}
    }
}
Neo.setupClass(OverlayChart);
Neo.setupClass(OverlayLayer);
Neo.setupClass(OverscanLayer);
Neo.setupClass(OverscanChart);

const
    // The chart configs the layer mirrors, by the layer config each one feeds
    mirrored = ['appName', 'bufferPx', 'dependencyStore', 'endDateField', 'rowHeight', 'startDateField', 'taskStore', 'timeAxis', 'windowId'],
    geometry = ['axisLeft', 'scrollLeft', 'viewportWidth'],
    // Every input the chart writes: the mirrored ones, the geometry and the analysis' highlights
    inputs   = [...mirrored, ...geometry, 'highlightedDependencyIds'],
    at       = (hour, minute=0) => new Date(Date.UTC(2026, 10, 9, hour, minute)),
    axis     = (pxPerMinute=1) => ({start: at(0), end: at(48), tickUnit: 'hour', tickStep: 1, pxPerMinute, snapMinutes: 15}),
    tasks    = (shift=0, gap=2) => Neo.create(TaskStore, {data: [
        {id: 'A', parentId: null, isLeaf: true, title: 'A', startDate: at(shift),           endDate: at(shift + 2)},
        {id: 'B', parentId: null, isLeaf: true, title: 'B', startDate: at(shift + 2 + gap), endDate: at(shift + 4 + gap)}
    ]}),
    links    = (type='FS', id='ab') => Neo.create(DependencyStore, {data: [{id, fromId: 'A', toId: 'B', type, lag: 0, lagUnit: 'hour'}]}),
    // Counts the projections of a layer from here on
    countProjections = layer => {
        const project = layer.project.bind(layer), count = {projections: 0};

        layer.project = () => (count.projections++, project());
        return count
    },
    // The x and y of each point of the first route, in px: A ends at x 120, B starts at x 240, rows are 48 px
    points   = layer => layer.arrows[0]?.d.split(' ').filter(token => !/[ML]/.test(token)).map(Number),
    // Counts every assignment to the given layer configs, also one that changes nothing
    countWrites = (layer, keys) => {
        const counts = {};

        for (const key of keys) {
            let proto = Object.getPrototypeOf(layer), descriptor;

            while (!(descriptor = Object.getOwnPropertyDescriptor(proto, key))) proto = Object.getPrototypeOf(proto);

            Object.defineProperty(layer, key, {
                configurable: true,
                get() { return descriptor.get.call(this) },
                set(value) { counts[key] = (counts[key] || 0) + 1; descriptor.set.call(this, value) }
            })
        }
        return counts
    };

test.describe('Neo.gantt.DependencyLayer: an input that changes re-projects the arrows', () => {
    let layer, owned;

    const create = (config={}) => {
        owned = [tasks(), links(), Neo.create(TimeAxis, axis())];
        layer = Neo.create(DependencyLayer, {
            appName, taskStore: owned[0], dependencyStore: owned[1], timeAxis: owned[2], viewportWidth: 2000, ...config
        });
        return layer
    };

    test.afterEach(() => {
        layer?.destroy();
        owned?.forEach(item => item.isDestroyed || item.destroy());
        layer = owned = null
    });

    test('the first projection draws the link from the end of A to the start of B', () => {
        expect(points(create())).toEqual([120, 24, 180, 24, 180, 72, 240, 72])
    });

    test('rowHeight', () => {
        create().rowHeight = 30;
        expect(points(layer)).toEqual([120, 15, 180, 15, 180, 45, 240, 45])
    });

    test('startDateField and endDateField', () => {
        create().startDateField = 'endDate';
        // B's start now reads its end date, 6 h in
        expect(points(layer).at(-2)).toBe(360);

        layer.set({endDateField: 'startDate', startDateField: 'startDate'});
        // A's end now reads its start date, at the axis start
        expect(points(layer)[0]).toBe(0);
        expect(points(layer).at(-2)).toBe(240)
    });

    test('taskStore, dependencyStore and timeAxis', () => {
        const later = tasks(1), starts = links('SS'), wide = Neo.create(TimeAxis, axis(2));

        create().taskStore = later;
        expect([points(layer)[0], points(layer).at(-2)]).toEqual([180, 300]);

        layer.dependencyStore = starts;
        expect(layer.arrows[0].data.type).toBe('SS');

        layer.set({dependencyStore: owned[1], timeAxis: wide});
        expect([points(layer)[0], points(layer).at(-2)]).toEqual([360, 600]);

        owned.push(later, starts, wide)
    });

    test('bufferPx and viewportWidth admit a link once their window reaches it', () => {
        // The route spans x 108 to 252 with its stubs: a 100 px window without overscan ends before it
        create({bufferPx: 0, viewportWidth: 100});
        expect(layer.arrows).toEqual([]);

        layer.bufferPx = 50;
        expect(layer.arrows).toHaveLength(1);

        layer.bufferPx = 0;
        expect(layer.arrows).toEqual([]);

        layer.viewportWidth = 300;
        expect(layer.arrows).toHaveLength(1)
    });

    test('a wider viewport inside the projected overscan keeps the projection, as a scroll does', () => {
        const count = countProjections(create({bufferPx: 400, viewportWidth: 1000}));

        layer.viewportWidth = 1100;
        expect(count.projections).toBe(0);

        layer.viewportWidth = 1500;
        expect(count.projections).toBe(1)
    });

    test('a set() of several inputs projects once, from all of them', () => {
        const
            starts = links('SS'),
            wide   = Neo.create(TimeAxis, axis(2)),
            count  = countProjections(create());

        owned.push(starts, wide);

        layer.set({dependencyStore: starts, rowHeight: 30, timeAxis: wide});

        expect(count.projections).toBe(1);
        // The start-to-start link at 2 px per minute and 30 px rows: it ends at the start of B, 4 h in
        expect(layer.arrows[0].data.type).toBe('SS');
        expect(points(layer).slice(-2)).toEqual([480, 45]);

        // A single write still projects at once
        layer.rowHeight = 48;
        expect(count.projections).toBe(2);
        expect(points(layer).at(-1)).toBe(72)
    })
});

test.describe('Neo.gantt.Container feeds its dependency layer once per input', () => {
    let gantt, owned;

    const create = (config={}, module=GanttContainer) => {
        owned = [tasks(), links()];
        gantt = Neo.create(module, {
            appName, store: owned[0], dependencyStore: owned[1], timeAxis: axis(), viewportWidth: 2000, ...config
        });
        return gantt.dependencyLayer
    };

    test.beforeEach(() => {
        Neo.ns('Neo.main.addon.DragDrop', true);
        Neo.main.addon.DragDrop = {setConfigs: async () => ({})}
    });

    test.afterEach(() => {
        gantt?.destroy();
        owned?.forEach(item => item.isDestroyed || item.destroy());
        gantt = owned = null
    });

    for (const [name, write, expected] of [
        ['rowHeight',       chart => {chart.rowHeight = 30},                         layer => points(layer)[1] === 15],
        ['endDateField',    chart => {chart.endDateField = 'startDate'},             layer => points(layer)[0] === 0],
        ['startDateField',  chart => {chart.startDateField = 'endDate'},             layer => points(layer).at(-2) === 360],
        ['timeAxis',        chart => {chart.timeAxis = axis(2)},                     layer => points(layer)[0] === 240],
        ['taskStore',       (chart, extra) => {chart.store = extra.tasks},           layer => points(layer)[0] === 180],
        ['dependencyStore', (chart, extra) => {chart.dependencyStore = extra.links}, layer => layer.arrows[0].data.type === 'SS']
    ]) {
        test(`the chart config behind ${name} reaches the layer in one write and redraws it`, () => {
            const
                layer  = create(),
                extra  = {links: links('SS'), tasks: tasks(1)},
                counts = countWrites(layer, inputs);

            owned.push(extra.links, extra.tasks);

            expect(points(layer)).toEqual([120, 24, 180, 24, 180, 72, 240, 72]);

            write(gantt, extra);

            // No syncDependencyLayer() call: the layer redraws on its own input
            expect(expected(layer)).toBe(true);
            expect(counts).toEqual({[name]: 1})
        })
    }

    test('the chart config behind bufferPx reaches the layer in one write and moves a link in and out of its window', () => {
        // The route spans x 108 to 252 with its stubs: a 100 px window without overscan ends before it
        const
            layer  = create({bufferPx: 0, viewportWidth: 100}),
            counts = countWrites(layer, inputs);

        expect(layer.arrows).toEqual([]);

        gantt.bufferPx = 50;
        expect(layer.arrows).toHaveLength(1);

        gantt.bufferPx = 0;
        expect(layer.arrows).toEqual([]);
        expect(counts).toEqual({bufferPx: 2})
    });

    test('a cascading edit and a scroll write no mirrored input, and the geometry and the highlights at most once', () => {
        const
            layer  = create(),
            counts = countWrites(layer, inputs);

        // An analysis that selects the link: the edit below is the first to apply it
        gantt.registerScheduleAnalysis({invalidateSchedule() {}, getHighlights: () => ({dependencyIds: ['ab']})});

        gantt.moveTask('A', {startDate: at(1), endDate: at(3)});

        expect(points(layer)[0]).toBe(180);
        expect(layer.arrows[0].data.highlighted).toBe('true');
        expect(mirrored.filter(key => counts[key])).toEqual([]);
        expect(geometry.every(key => (counts[key] || 0) <= 1)).toBe(true);
        expect(counts.highlightedDependencyIds).toBe(1);

        for (const key of Object.keys(counts)) delete counts[key];

        gantt.headerToolbar.scrollLeft = 300;

        expect(layer.scrollLeft).toBe(300);
        expect(Object.keys(counts).filter(key => !geometry.includes(key))).toEqual([]);
        expect(geometry.every(key => (counts[key] || 0) <= 1)).toBe(true)
    });

    test('a store replaced under a registered analysis is projected once, already with its highlights', () => {
        const
            layer = create(),
            next  = links('SS', 'ab2');

        owned.push(next);

        // The analysis selects the link of whichever dependency store the chart holds
        gantt.registerScheduleAnalysis({
            invalidateSchedule() {},
            getHighlights: () => ({dependencyIds: [gantt.dependencyStore.getAt(0).id]})
        });
        gantt.syncDependencyLayer();

        expect(layer.arrows[0].data).toMatchObject({dependencyId: 'ab', highlighted: 'true'});

        const
            project = layer.project.bind(layer),
            drawn   = [];

        layer.project = () => {
            const arrows = project();

            drawn.push(arrows.map(({data}) => `${data.dependencyId} ${data.highlighted}`));
            return arrows
        };

        gantt.dependencyStore = next;

        expect(drawn).toEqual([['ab2 true']]);
        expect(layer.vdom.html).toMatch(/data-dependency-id="ab2"[^>]*data-highlighted="true"/)
    });

    test('a chart subclass that points a relay at another layer config feeds it from the first draw', () => {
        const layer = create({bufferPx: 125}, OverscanChart);

        expect(layer).toBeInstanceOf(OverscanLayer);
        expect(layer.overscan).toBe(125);
        // Nothing feeds the layer's own bufferPx any more: it keeps its default
        expect(layer.bufferPx).toBe(400);

        gantt.bufferPx = 130;
        expect(layer.overscan).toBe(130)
    });

    test('a dependencyLayerConfig does not replace the chart\'s motion map: a link follows the span its bar follows', () => {
        const layer = create({dependencyLayerConfig: {drawnSpans: new Map()}});

        expect(layer.drawnSpans).toBe(gantt.drawnSpans);

        // A cascade draws A two hours late while it moves: its link leaves from there
        gantt.drawnSpans.set('A', [at(2).getTime(), at(4).getTime()]);
        layer.project();

        expect(points(layer)[0]).toBe(240)
    });

    test('dependencyLayerConfig merges deep: an instance config keeps a subclass default and swaps the class', () => {
        const layer = create({dependencyLayerConfig: {module: OverlayLayer}}, OverlayChart);

        expect(layer).toBeInstanceOf(OverlayLayer);
        expect(gantt.dependencyLayerConfig).toEqual({bufferPx: 800, module: OverlayLayer});

        // The override of a mirrored input survives the chart's draws: only a change of the chart config replaces it
        gantt.syncDependencyLayer();
        expect(layer.bufferPx).toBe(800);

        gantt.bufferPx = 200;
        expect(layer.bufferPx).toBe(200)
    });

    test('the center body is the one place that mounts the layer, as its direct child', () => {
        const
            layer      = create(),
            references = () => gantt.body.getVdomRoot().cn.filter(node => node.componentId === layer.id);

        gantt.body.createRowPool();
        expect(references()).toHaveLength(1);

        gantt.syncDependencyLayer();
        gantt.body.createRowPool();
        expect(references()).toHaveLength(1);
        expect(gantt.ensureDependencyLayer()).toBe(layer)
    });

    test('a resize of the center body alone moves the layer\'s window', () => {
        const
            late  = Neo.create(TaskStore, {data: [
                {id: 'A', parentId: null, isLeaf: true, title: 'A', startDate: at(20), endDate: at(22)},
                {id: 'B', parentId: null, isLeaf: true, title: 'B', startDate: at(24), endDate: at(26)}
            ]}),
            layer = create({bufferPx: 100, store: late, viewportWidth: 600});

        owned.push(late);

        gantt.body.set({availableHeight: 400, containerWidth: 600});
        gantt.syncDependencyLayer();

        // The link runs from x 1320 to x 1440: outside a 600 px window with 100 px of overscan
        expect(layer.arrows).toEqual([]);

        gantt.body.containerWidth = 1800;

        expect(layer.viewportWidth).toBe(gantt.timelineColumn.effectiveViewportWidth);
        expect(layer.arrows).toHaveLength(1)
    });

    for (const side of ['Start', 'End']) {
        test(`a resize of the locked ${side.toLowerCase()} column moves the layer's window with the timeline's`, () => {
            const
                // A ends 11 h in and B starts an hour later: the link runs from x 660 to x 720
                late   = tasks(9, 1),
                layer  = create({
                    bufferPx   : 0,
                    store      : late,
                    taskColumns: [
                        {type: 'tree', dataField: 'title', text: 'Task', width: 200, locked: 'start'},
                        {dataField: 'percentDone', text: 'Done', width: 200, locked: 'end'}
                    ],
                    viewportWidth: 600
                }),
                locked = {Start: gantt.bodyStart, End: gantt.bodyEnd},
                field  = {Start: 'title', End: 'percentDone'};

            owned.push(late);

            // A 1000 px grid with 200 px locked on each side leaves the timeline 600 px
            for (const key of ['Start', 'End']) {
                locked[key].columnPositions.get(field[key]) || locked[key].columnPositions.add({dataField: field[key], width: 200, x: 0});
                locked[key].availableWidth = 200
            }
            gantt.body.set({availableHeight: 400, containerWidth: 1000});
            gantt.syncDependencyLayer();

            expect(layer.viewportWidth).toBe(600);
            expect(layer.arrows).toEqual([]);

            // What a drag of the column's edge does: 150 px more timeline, which reaches the link
            locked[side].updateCellPositions(field[side], 50);

            expect(gantt.timelineColumn.effectiveViewportWidth).toBe(750);
            expect(layer.viewportWidth).toBe(750);
            expect(layer.arrows).toHaveLength(1)
        })
    }
});
