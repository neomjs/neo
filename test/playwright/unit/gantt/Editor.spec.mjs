import {test, expect} from '@playwright/test';
import {setup}        from '../../setup.mjs';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Gantt from '../../../../src/gantt/Container.mjs';

const appName = 'GanttEditorTest';
setup({
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

test('an analysis plugin can highlight records and edges and release its registration', () => {
    const gantt = Neo.create(Gantt, {
        appName, barDraggable: false,
        store: {data: [
            {id: 'cut', title: 'Cut panels', isLeaf: true, startDate: '2026-11-09T08:00Z', endDate: '2026-11-09T09:00Z'},
            {id: 'fit', title: 'Fit panels', isLeaf: true, startDate: '2026-11-09T09:00Z', endDate: '2026-11-09T10:00Z'}
        ]},
        dependencyStore      : {data: [{id: 'sequence', fromId: 'cut', toId: 'fit'}]},
        dependencyLayerConfig: {highlightedDependencyIds: ['sequence']},
        timeAxis             : {start: '2026-11-09', end: '2026-11-10'}
    });
    try {
        // Explicit layer styling works before an analysis is attached.
        gantt.syncDependencyLayer();
        expect(gantt.dependencyLayer.highlightedDependencyIds).toEqual(['sequence']);
        let   invalidations = 0;
        const attach        = () => gantt.registerScheduleAnalysis({
            invalidateSchedule() { invalidations++ },
            getHighlights: () => ({taskIds: ['fit'], dependencyIds: ['sequence']})
        });
        const first = attach(), current = attach();
        expect(first()).toBe(false);
        gantt.syncDependencyLayer();
        expect(gantt.timelineColumn.highlightedRecordIds).toEqual(['fit']);
        const before = invalidations;
        gantt.moveTask('cut', {endDate: '2026-11-09T09:30Z'});
        expect(invalidations).toBeGreaterThan(before);
        expect(current()).toBe(true)
    } finally {
        gantt.destroy()
    }
});

test('an attached service receives the task key and can defer or refuse an editor change', () => {
    const gantt = Neo.create(Gantt, {
        appName, barDraggable: false, store: {data: [{
            id       : 42, title: 'First draft', isLeaf: true, parentId: null,
            startDate: '2026-11-09T09:00Z', endDate: '2026-11-09T12:00Z'
        }]},
        dependencyStore: {data: []},
        timeAxis       : {start: '2026-11-09', end: '2026-11-10'}
    });
    try {
        const task   = gantt.store.get(42), calls = [], changes = [];
        let   result = {status: 'pending', pending: {id: 1}};
        gantt.schedule = {
            store          : gantt.store,
            dependencyStore: gantt.dependencyStore,
            handlesTask    : id => id === 42,
            moveTask(id, proposal) {
                calls.push([id, proposal.title]);
                return result
            }
        };
        gantt.on('taskChange', change => changes.push(change));

        expect(gantt.commitTimelineEdit(task, {title: 'Second draft'}, {source: 'editor'})).toMatchObject(result);
        result = {status: 'refused', message: 'The task is locked'};
        expect(gantt.commitTimelineEdit(task, {title: 'Final draft'}, {source: 'editor'})).toMatchObject(result);
        expect(calls).toEqual([[42, 'Second draft'], [42, 'Final draft']]);
        expect(task.title).toBe('First draft');
        expect(changes).toHaveLength(0);

        // A service bound to the former tree cannot authorize native edits on its replacement.
        gantt.store = {data: [{
            id       : 17, title: 'New plan', isLeaf: true, parentId: null,
            startDate: '2026-11-09T10:00Z', endDate: '2026-11-09T13:00Z'
        }]};
        const replacement = gantt.store.get(17);
        expect(gantt.commitTimelineEdit(replacement, {title: 'Changed'}, {source: 'editor'}))
            .toMatchObject({status: 'refused'});
        expect(replacement.title).toBe('New plan');
        expect(changes).toHaveLength(0)
    } finally {
        gantt.destroy()
    }
});
