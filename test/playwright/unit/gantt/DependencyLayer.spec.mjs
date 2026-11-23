import {expect, test} from '@playwright/test';
import {setup}        from '../../setup.mjs';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import TimeAxis        from '../../../../src/timeline/TimeAxis.mjs';
import DependencyLayer from '../../../../src/gantt/DependencyLayer.mjs';
import DependencyStore from '../../../../src/gantt/DependencyStore.mjs';
import TaskStore       from '../../../../src/gantt/TaskStore.mjs';

const appName = 'GanttDependencyLayerTest', epoch = Date.UTC(2026, 0, 1);
setup({neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false},
    appConfig: {name: appName, isMounted: () => true}});

test('highlighted edges use neutral classes and markers, and borrowed inputs survive teardown', () => {
    const tasks = Neo.create(TaskStore, {data: [
        {id: 'a', isLeaf: true, startDate: new Date(epoch), endDate: new Date(epoch + 60_000)},
        {id: 'b', isLeaf: true, startDate: new Date(epoch + 120_000), endDate: new Date(epoch + 180_000)}
    ]});
    const edges = Neo.create(DependencyStore, {data: [{id: 'ab', fromId: 'a', toId: 'b', type: 'FS'}]});
    const axis  = Neo.create(TimeAxis, {start: new Date(epoch), end: new Date(epoch + 600_000), pxPerMinute: 1});
    const layer = Neo.create(DependencyLayer, {appName, taskStore: tasks, dependencyStore: edges, timeAxis: axis,
        highlightedDependencyIds: ['ab'], viewportWidth: 600});
    try {
        const [arrow] = layer.project();
        expect(arrow.cls).toContain('neo-gantt-dependency-arrow-highlighted');
        expect(arrow.data.highlighted).toBe('true');
        expect(arrow['marker-end']).toContain('__arrowhead-highlighted');
        expect(layer.vdom.html).toContain('data-highlighted="true"')
    } finally { layer.destroy() }
    expect(tasks.isDestroyed).not.toBe(true);
    expect(edges.isDestroyed).not.toBe(true);
    expect(axis.isDestroyed).not.toBe(true);
    tasks.destroy(); edges.destroy(); axis.destroy()
});

test('a link to the second of two successors starting on its end date never crosses the first one\'s bar', () => {
    const date  = x => new Date(epoch + x * 60_000);
    const task  = (id, from, to) => ({id, title: id, isLeaf: true, collapsed: false, parentId: null, startDate: date(from), endDate: date(to)});
    const store = Neo.create(TaskStore, {data: [task('design', 20, 108), task('build', 108, 200), task('test', 108, 160)]});
    const links = Neo.create(DependencyStore, {data: [{id: 'to-test', fromId: 'design', toId: 'test', type: 'FS'}]});
    const axis  = Neo.create(TimeAxis, {start: date(0), end: date(400), pxPerMinute: 1});
    const layer = Neo.create(DependencyLayer, {appName, taskStore: store, dependencyStore: links, rowHeight: 24, timeAxis: axis, viewportWidth: 400, bufferPx: 0});

    try {
        const [route] = layer.project();
        // Row 1 holds build from x 108 on; the route turns on the boundary below design (y 24) and drops at x 96
        expect(route.d).toBe('M 108 12 L 120 12 L 120 24 L 96 24 L 96 60 L 108 60')
    } finally {
        layer.destroy(); links.destroy(); store.destroy(); axis.destroy()
    }
});

test('the buffered horizontal window intersects the rounded SVG route, including turns outside its anchors', () => {
    const date = x => new Date(epoch + x * 60_000);
    const task = (id, x, extra) => ({id, title: id, isLeaf: true, collapsed: false, parentId: null,
        startDate: date(x), endDate: date(x + 8), ...extra});
    const edge  = (id, fromId, toId, type) => ({id, fromId, toId, type});
    const store = Neo.create(TaskStore, {data: [
        task('a', 100.004), task('b', 100.004), task('c', 200.006), task('d', 200.006),
        task('parent', 650, {isLeaf: false}), task('child', 680, {parentId: 'parent'})
    ]});
    const dependencies = Neo.create(DependencyStore, {data: [
        edge('return-sf', 'c', 'a', 'SF'), edge('left', 'a', 'b', 'SS'), edge('forward', 'a', 'c', 'FS'),
        edge('right', 'c', 'd', 'FF'), edge('return-fs', 'c', 'a', 'FS'), edge('child-link', 'parent', 'child', 'FS')
    ]});
    const axis  = Neo.create(TimeAxis, {start: date(0), end: date(1000), pxPerMinute: 1});
    const layer = Neo.create(DependencyLayer, {appName, taskStore: store, dependencyStore: dependencies,
        rowHeight: 24, timeAxis: axis, viewportWidth: 1000, bufferPx: 0});
    const project = (scrollLeft, viewportWidth, bufferPx=0) => {
        layer.set({scrollLeft, viewportWidth, bufferPx});
        return layer.project().map(p => [p.data.dependencyId, p.id, p.d])
    };
    try {
        const full = project(0, 1000);
        const byId = new Map(full.map(p => [p[0], p]));
        expect([...byId.keys()]).toEqual(['return-sf','left','forward','right','return-fs','child-link']);
        expect(byId.get('left')).toEqual(['left', layer.id + '__dep__left', 'M 100 12 L 88 12 L 88 36 L 100 36']);
        expect(byId.get('right')[2]).toBe('M 208.01 60 L 220.01 60 L 220.01 84 L 208.01 84');
        // A return turns on the boundary between rows c and b (y 48), never through b's bar at its centre (y 36)
        expect(byId.get('return-sf')[2]).toBe('M 200.01 60 L 212.01 60 L 212.01 48 L 96 48 L 96 12 L 108 12');
        expect(byId.get('return-fs')[2]).toBe('M 208.01 60 L 220.01 60 L 220.01 48 L 88 48 L 88 12 L 100 12');
        expect(byId.get('forward')[2]).toBe('M 108 12 L 154.01 12 L 154.01 60 L 200.01 60');
        // The left edge needs overscan to touch x=88. The right edge rounds out to 220.01.
        expect(project(86, 1, 1)).toEqual(['left','return-fs'].map(id => byId.get(id)));
        expect(project(86, 1)).toEqual([]);
        expect(project(220.01, 1)).toEqual(['right','return-fs'].map(id => byId.get(id)));
        expect(project(220.011, 1)).toEqual([]);
        expect(project(212.01, 1)).toContainEqual(byId.get('return-sf'));
        expect(project(150, 1)).toEqual(['return-sf','forward','return-fs'].map(id => byId.get(id)));
        expect(project(800, 20)).toEqual([]);
        store.collapse('parent');
        expect(project(0, 1000)).toEqual(full.filter(([id]) => id !== 'child-link'));
        store.expand('parent');
        expect(project(0, 1000)).toEqual(full)
    } finally {
        layer.destroy(); axis.destroy(); dependencies.destroy(); store.destroy()
    }
});

test('with the axis starting past the overscan, a scroll keeps the projected window until it crosses it', () => {
    const date  = x => new Date(epoch + x * 60_000);
    const task  = (id, from, to) => ({id, title: id, isLeaf: true, collapsed: false, parentId: null, startDate: date(from), endDate: date(to)});
    const store = Neo.create(TaskStore, {data: [task('a', 10, 20), task('b', 30, 40)]});
    const links = Neo.create(DependencyStore, {data: [{id: 'ab', fromId: 'a', toId: 'b', type: 'FS'}]});
    const axis  = Neo.create(TimeAxis, {start: date(0), end: date(4000), pxPerMinute: 1});
    // The axis starts 800 px into its region, beyond 40 px of overscan
    const layer = Neo.create(DependencyLayer, {appName, taskStore: store, dependencyStore: links, timeAxis: axis,
        axisLeft: 800, bufferPx: 40, scrollLeft: 50, viewportWidth: 1000});
    const project     = layer.project.bind(layer);
    let   projections = 0;

    try {
        project();
        layer.project = () => (projections++, project());

        // Until the axis start scrolls 40 px past the region's left edge, the visible axis stays inside [0, 1040]
        layer.scrollLeft = 51;
        layer.scrollLeft = 839;
        expect(projections).toBe(0);

        layer.scrollLeft = 841;
        expect(projections).toBe(1)
    } finally {
        layer.destroy(); links.destroy(); store.destroy(); axis.destroy()
    }
});

test('links into and out of a milestone meet the left and right points of its diamond', () => {
    const
        date      = x => new Date(epoch + x * 60_000),
        rowHeight = 40,
        half      = DependencyLayer.milestoneHalfSize(rowHeight),
        store     = Neo.create(TaskStore, {data: [
            {id: 'work-a', isLeaf: true, startDate: date(40),  endDate: date(100)},
            {id: 'gate',   isLeaf: true, startDate: date(160), endDate: date(160), milestone: true},
            {id: 'work-b', isLeaf: true, startDate: date(220), endDate: date(280)}
        ]}),
        links     = Neo.create(DependencyStore, {data: [
            {id: 'to-gate-fs',   fromId: 'work-a', toId: 'gate',   type: 'FS'},
            {id: 'from-gate-fs', fromId: 'gate',   toId: 'work-b', type: 'FS'},
            {id: 'from-gate-ss', fromId: 'gate',   toId: 'work-b', type: 'SS'},
            {id: 'to-gate-ff',   fromId: 'work-a', toId: 'gate',   type: 'FF'}
        ]}),
        axis      = Neo.create(TimeAxis, {start: date(0), end: date(400), pxPerMinute: 1}),
        layer     = Neo.create(DependencyLayer, {
            appName, bufferPx: 0, dependencyStore: links, rowHeight, taskStore: store, timeAxis: axis, viewportWidth: 400
        });

    try {
        const byId = new Map(layer.project().map(route => [route.data.dependencyId, route]));

        expect(half).toBe(11);
        expect(byId.get('to-gate-fs').d).toMatch(new RegExp(`^M 100 20 .* L ${160 - half} 60$`));
        expect(byId.get('from-gate-fs').d).toBe(`M ${160 + half} 60 L ${160 + half + 12} 60 L ${160 + half + 12} 80 L 208 80 L 208 100 L 220 100`);
        expect(byId.get('from-gate-ss').d).toMatch(new RegExp(`^M ${160 - half} 60 .* L 220 100$`));
        expect(byId.get('to-gate-ff').d).toMatch(new RegExp(`^M 100 20 .* L ${160 + half} 60$`))
    } finally {
        layer.destroy(); links.destroy(); store.destroy(); axis.destroy()
    }
});
