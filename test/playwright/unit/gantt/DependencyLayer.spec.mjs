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
        expect(byId.get('return-sf')[2]).toBe('M 200.01 60 L 212.01 60 L 212.01 36 L 96 36 L 96 12 L 108 12');
        expect(byId.get('return-fs')[2]).toBe('M 208.01 60 L 220.01 60 L 220.01 36 L 88 36 L 88 12 L 100 12');
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
