import {setup}        from '../../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import EventStore    from '../../../../../src/timeline/store/Events.mjs';
import GanttPane     from '../../../../../apps/workstation/view/GanttPane.mjs';
import People        from '../../../../../apps/workstation/store/People.mjs';
import PlanLinks     from '../../../../../apps/workstation/store/PlanLinks.mjs';
import PlanTasks     from '../../../../../apps/workstation/store/PlanTasks.mjs';
import SchedulerPane from '../../../../../apps/workstation/view/SchedulerPane.mjs';
import WorkItems     from '../../../../../apps/workstation/store/WorkItems.mjs';
import {planDay}     from '../../../../../apps/workstation/store/plan.mjs';

const appName = 'WorkstationPlanningStoresTest';

setup({
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

const
    DAY      = 86_400_000,
    // A Monday, so a week of the plan starts on the plan day
    BASE     = new Date(Date.UTC(2026, 10, 16)),
    STATUSES = ['backlog', 'ready', 'in-progress', 'review', 'done'],
    at       = days => new Date(BASE.getTime() + days * DAY),
    plain    = store => store.items.map(({id, title, resourceId, status, order, progress, startDate, endDate}) =>
        ({id, title, resourceId, status, order, progress, startDate: startDate.toISOString(), endDate: endDate.toISOString()}));

test.beforeEach(() => {
    Neo.ns('Neo.main.addon.DragDrop', true);
    Neo.main.addon.DragDrop = {setConfigs: () => Promise.resolve({}), setDragProxyElement: () => Promise.resolve()}
});

test('the plan day is midnight UTC of the day that holds the clock', () => {
    expect(planDay(new Date('2026-11-16T22:30:00Z')).toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(planDay(new Date('2026-11-17T00:00:00Z')).toISOString()).toBe('2026-11-17T00:00:00.000Z')
});

test('the seeded work items are the same plan for the same day, named, and around that day', () => {
    const people = Neo.create(People),
          first  = Neo.create(WorkItems, {baseDate: BASE}),
          second = Neo.create(WorkItems, {baseDate: BASE});

    try {
        const items = plain(first), keys = new Set(people.items.map(person => person.id));

        expect(items, 'one day, one plan').toEqual(plain(second));
        expect(items).toHaveLength(15);
        expect(new Set(items.map(item => item.title)).size, 'every work item has its own name').toBe(15);
        expect(people.items.map(person => person.name)).toEqual(['Maya Chen', 'Jonas Berg', 'Priya Nair', 'Tom Okafor', 'Lena Fischer', 'Sam Rivera']);

        for (const item of first.items) {
            expect(keys.has(item.resourceId), `${item.id} belongs to a person of the team`).toBe(true);
            expect(STATUSES, `${item.id} sits in a board column`).toContain(item.status);
            expect(Number.isFinite(item.order), `${item.id} has a rank in its column`).toBe(true);
            expect(item.startDate < item.endDate, `${item.id} spans time`).toBe(true);
            expect(item.startDate >= at(-8) && item.endDate <= at(14), `${item.id} lies in the schedule's window`).toBe(true)
        }

        expect(first.items.filter(item => item.startDate < at(1) && item.endDate > BASE).length,
            'the team has work in hand on the plan day').toBeGreaterThan(3);

        for (const status of STATUSES) {
            const ranks = first.items.filter(item => item.status === status).map(item => item.order);
            expect(new Set(ranks).size, `${status} ranks are distinct`).toBe(ranks.length)
        }
    } finally {
        first.destroy();
        second.destroy();
        people.destroy()
    }
});

test('the work items are one event store that carries the board\'s fields and keeps no store order', () => {
    const store = Neo.create(WorkItems, {baseDate: BASE});

    try {
        expect(store).toBeInstanceOf(EventStore);
        expect(store.sorters, 'a sort would fire load and re-project every view of the shared store').toEqual([]);

        for (const field of ['startDate', 'endDate', 'resourceId', 'title', 'status', 'order', 'progress']) {
            expect(store.model.getField(field), `the record carries ${field}`).toBeTruthy()
        }

        expect(store.getRangeRecords(at(-8), at(14), 'tom').map(item => item.id)).toEqual(['wi-7', 'wi-8', 'wi-9'])
    } finally {
        store.destroy()
    }
});

test('the release plan is a tree whose links are tight: each task starts where its latest predecessor ends', () => {
    const tasks = Neo.create(PlanTasks, {baseDate: BASE}),
          links = Neo.create(PlanLinks);

    try {
        expect(tasks.getChildren().map(task => task.id)).toEqual(['discovery', 'design', 'build', 'launch']);
        expect(tasks.getChildren('build').map(task => task.title)).toEqual(['Booking service', 'Booking screens', 'Account migration']);
        expect(tasks.get('launch-day').milestone).toBe(true);

        const successors = new Set(links.items.map(link => link.toId));

        for (const link of links.items) {
            expect(tasks.get(link.fromId), `${link.id} starts at a task`).toBeTruthy();
            expect(tasks.get(link.toId),   `${link.id} ends at a task`).toBeTruthy()
        }

        for (const id of successors) {
            const ends = links.items.filter(link => link.toId === id).map(link => tasks.get(link.fromId).endDate.getTime());
            expect(tasks.get(id).startDate.getTime(), `${id} starts at its latest predecessor's end`).toBe(Math.max(...ends))
        }
    } finally {
        tasks.destroy();
        links.destroy()
    }
});

test.describe('the planning panes', () => {
    let pane, stores;

    test.afterEach(() => {
        pane?.destroy();
        stores?.forEach(store => store.destroy());
        pane = stores = null
    });

    /** The bars the schedule renders in one person's row. */
    const rowBars = (scheduler, index) => scheduler.body.items[index]?.vdom?.cn?.[0]?.cn?.[0]?.cn?.[0]?.cn || [];

    test('a status written to the shared record repaints its bar; a bar moved in the schedule is one record change', () => {
        const people    = Neo.create(People),
              workItems = Neo.create(WorkItems, {baseDate: BASE}),
              changes   = [];

        stores = [people, workItems];
        pane   = Neo.create(SchedulerPane, {
            appName,
            eventStore   : workItems,
            store        : people,
            timeAxis     : SchedulerPane.createTimeAxis(BASE),
            viewportWidth: 1600
        });

        pane.body.set({availableHeight: 400, containerWidth: 1600});
        pane.timelineColumn.refreshMountedRows();

        const tomRow = people.indexOf(people.get('tom')),
              bar    = id => rowBars(pane, tomRow).find(node => node.data.eventId === id);

        expect(rowBars(pane, tomRow).map(node => node.data.eventId).sort()).toEqual(['wi-7', 'wi-8', 'wi-9']);
        expect(bar('wi-7').cls).toContain('neo-scheduler-bar-amber');
        expect(bar('wi-8').cls).toContain('neo-scheduler-bar-violet');
        expect(bar('wi-9').data.status).toBe('ready');

        workItems.on('recordChange', ({fields, record}) => changes.push({id: record.id, fields: fields.map(field => field.name).sort()}));

        // The write a board makes when a card lands in another column
        workItems.get('wi-9').set({order: 4000, status: 'done'});

        expect(changes).toEqual([{id: 'wi-9', fields: ['order', 'status']}]);
        expect(bar('wi-9').data.status, 'the bar follows the record').toBe('done');
        expect(bar('wi-9').cls).toContain('neo-scheduler-bar-emerald');

        changes.length = 0;
        expect(pane.moveEvent('wi-9', {startDate: at(3), endDate: at(7)}, {source: 'keyboard'})).toBeTruthy();

        expect(changes).toEqual([{id: 'wi-9', fields: ['endDate', 'startDate']}]);
        expect(workItems.get('wi-9').startDate.toISOString(), 'the record holds the new dates').toBe(at(3).toISOString())
    });

    test('a task moved in the release plan moves its linked successors with it', () => {
        const tasks = Neo.create(PlanTasks, {baseDate: BASE}),
              links = Neo.create(PlanLinks),
              start = id => tasks.get(id).startDate.toISOString();

        stores = [tasks, links];
        pane   = Neo.create(GanttPane, {appName, dependencyStore: links, store: tasks, timeAxis: GanttPane.createTimeAxis(BASE)});

        const before = {screens: start('screens'), launchDay: start('launch-day'), service: start('service')},
              result = pane.moveTask('flow-design', {startDate: at(-7), endDate: at(-3)});

        expect(result, 'the edit commits').toBeTruthy();
        expect(start('flow-design')).toBe(at(-7).toISOString());
        expect(start('account-design'), 'its successor follows by the same day').toBe(at(-3).toISOString());
        expect(start('screens')).toBe(new Date(Date.parse(before.screens) + DAY).toISOString());
        expect(start('launch-day'), 'the cascade reaches the end of the chain').toBe(new Date(Date.parse(before.launchDay) + DAY).toISOString());
        expect(start('service'), 'a task off the moved chain stays').toBe(before.service)
    })
});
