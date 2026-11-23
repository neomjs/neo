import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import Scheduler      from '../../../../src/scheduler/Container.mjs';
import SchedulerZone  from '../../../../src/scheduler/EventDragZone.mjs';
import TimelineColumn from '../../../../src/timeline/Column.mjs';
import Events         from '../../../../src/timeline/store/Events.mjs';
import Gantt          from '../../../../src/gantt/Container.mjs';
import TaskModel      from '../../../../src/gantt/TaskModel.mjs';
import TaskStore      from '../../../../src/gantt/TaskStore.mjs';

const appName = 'GanttInheritanceTest';
setup({neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}});

class CustomColumn extends TimelineColumn {
    static config = {className: 'Test.GanttInheritance.CustomColumn'}
}
class CustomZone extends SchedulerZone {
    static config = {className: 'Test.GanttInheritance.CustomZone'}
}
Neo.setupClass(CustomColumn);
Neo.setupClass(CustomZone);

class CustomScheduler extends Scheduler {
    static config = {className: 'Test.GanttInheritance.CustomScheduler'}
    getTimelineLockedColumns() { return [{dataField: 'title', text: 'Custom', width: 120}] }
    getTimelineColumnClass() { return CustomColumn }
    getTimelineRecordStore() { return this.store }
    getTimelineColumnStore() { return null }
    getEventDragZoneClass() { return CustomZone }
    getEventDragZoneDefaults() { return {useProxy: true} }
}
Neo.setupClass(CustomScheduler);

test('a subclass controls columns, gesture class, and record store without changing the base', () => {
    const rows = Neo.create(Events, {data: [{id: 8, resourceId: 'r', title: 'Item',
        startDate: '2026-11-09T01:00Z', endDate: '2026-11-09T02:00Z'}]});
    const other = Neo.create(Events, {data: [{id: 8, resourceId: 'r', title: 'Other',
        startDate: '2026-11-09T01:00Z', endDate: '2026-11-09T02:00Z'}]});
    const chart = Neo.create(CustomScheduler, {appName, store: rows, eventStore: other,
        timeAxis: {start: '2026-11-09', end: '2026-11-10'}});
    try {
        expect(chart.timelineColumn).toBeInstanceOf(CustomColumn);
        expect(chart.buildSchedulerColumns([{module: TimelineColumn, dataField: 'extra'},
            {module: CustomColumn, dataField: 'other'}])).toHaveLength(2);
        expect(chart.timelineColumn.eventStore).toBeNull();
        expect(chart.lockedStartColumns[0].dataField).toBe('title');
        expect(chart.eventDragZone).toBeInstanceOf(CustomZone);
        expect(chart.eventDragZone.useProxy).toBe(true);
        expect(chart.eventDragZone.store).toBe(rows);
        expect(chart.resolveEventRecord('8')).toBe(rows.get(8));
        expect(chart.resolveEventRecord(other.get(8))).toBeNull();
        chart.eventStore = null;
        expect(chart.eventDragZone.store).toBe(rows);
        expect(chart.timelineColumn.eventStore).toBeNull()
    } finally { chart.destroy(); rows.destroy(); other.destroy() }
});

test('task and event single-object arguments use their own keys and custom task identities', () => {
    const model = Neo.create(TaskModel, {fields: [...TaskModel.config.fields, {name: 'key'}]});
    const tasks = Neo.create(TaskStore, {model, keyProperty: 'key', data: [{id: 'other-id', key: 'task-a',
        isLeaf: true, parentId: null, startDate: '2026-11-09T01:00Z', endDate: '2026-11-09T02:00Z'}]});
    const chart = Neo.create(Gantt, {appName, store: tasks, dependencyStore: {}, barDraggable: false,
        timeAxis: {start: '2026-11-09T00:00Z', end: '2026-11-10T00:00Z'}});
    try {
        const task = tasks.get('task-a');
        expect(chart.resolveTaskRecord('task-a')).toBe(task);
        expect(chart.resolveEventRecord(task)).toBe(task);
        expect(chart.resolveTaskRecord({key: 'task-a'})).toBeNull();
        const result = chart.moveTask({taskId: 'task-a', startDate: '2026-11-09T03:00Z', endDate: '2026-11-09T04:00Z'});
        expect(result.updates.startDate.toISOString()).toBe('2026-11-09T03:00:00.000Z');
        expect(task.startDate.toISOString()).toBe('2026-11-09T03:00:00.000Z');
        expect(chart.moveTask({eventId: 'task-a', startDate: '2026-11-09T05:00Z'})).toBeNull()
    } finally { chart.destroy(); tasks.destroy(); model.destroy() }
});

test('base event arguments retain numeric lookup and invalid locked descriptors are ignored', () => {
    const events = Neo.create(Events, {data: [{id: 8, resourceId: 'r', title: 'Event',
        startDate: '2026-11-09T01:00Z', endDate: '2026-11-09T02:00Z'}]});
    const chart = Neo.create(Scheduler, {appName, eventStore: events, store: {data: []}, barDraggable: false,
        timeAxis: {start: '2026-11-09T00:00Z', end: '2026-11-10T00:00Z'}});
    try {
        const record = events.get(8);
        expect(chart.resolveEventRecord('8')).toBe(record);
        const result = chart.moveEvent({eventId: '8', startDate: '2026-11-09T03:00Z', endDate: '2026-11-09T04:00Z'});
        expect(result.startDate.toISOString()).toBe('2026-11-09T03:00:00.000Z');
        chart.getTimelineLockedColumns = () => ({not: 'an array'});
        expect(chart.buildSchedulerColumns()).toHaveLength(1)
    } finally { chart.destroy(); events.destroy() }
});
