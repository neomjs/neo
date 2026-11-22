import {setup}        from '../../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import EventStore                                         from '../../../../../src/timeline/store/Events.mjs';
import BoardPane                                          from '../../../../../apps/workstation/view/BoardPane.mjs';
import GanttPane                                          from '../../../../../apps/workstation/view/GanttPane.mjs';
import People                                             from '../../../../../apps/workstation/store/People.mjs';
import PlanLinks                                          from '../../../../../apps/workstation/store/PlanLinks.mjs';
import PlanTasks                                          from '../../../../../apps/workstation/store/PlanTasks.mjs';
import SchedulerPane                                      from '../../../../../apps/workstation/view/SchedulerPane.mjs';
import WorkItems                                          from '../../../../../apps/workstation/store/WorkItems.mjs';
import {planDay}                                          from '../../../../../apps/workstation/store/plan.mjs';
import {daysLabel, lockedWidth, planningAxis, planWindow} from '../../../../../apps/workstation/view/planningCalendar.mjs';

const appName = 'WorkstationPlanningStoresTest';

setup({
    neoConfig: {unitTestMode: true, allowVdomUpdatesInTests: false, useDomApiRenderer: false},
    appConfig: {name: appName, isMounted: () => true, vnodeInitialising: false}
});

/**
 * @summary A schedule that names its own review bar, as an app extending the Workstation would.
 * @class WorkstationPlanningStoresTest.ReviewedSchedulerPane
 * @extends Workstation.view.SchedulerPane
 */
class ReviewedSchedulerPane extends SchedulerPane {
    static statusBarCls = {...SchedulerPane.statusBarCls, review: 'reviewed-plan-bar'}

    static config = {
        /**
         * @member {String} className='WorkstationPlanningStoresTest.ReviewedSchedulerPane'
         * @protected
         */
        className: 'WorkstationPlanningStoresTest.ReviewedSchedulerPane'
    }
}

Neo.setupClass(ReviewedSchedulerPane);

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
    Neo.main.addon.DragDrop = {setConfigs: () => Promise.resolve({}), setDragProxyElement: () => Promise.resolve()};

    // A card's editor is a modal dialog: the main thread's focus and mask calls have no window here
    Neo.ns('Neo.main.DomAccess', true);
    Neo.main.DomAccess.selectNode    ??= () => {};
    Neo.main.DomAccess.syncModalMask ??= () => {};
    Neo.main.DomAccess.trapFocus     ??= () => {}
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
        const items = plain(first), keys = new Set(people.items.map(person => person.id)), {start, end} = planWindow(BASE);

        expect(items, 'one day, one plan').toEqual(plain(second));
        expect(items).toHaveLength(15);
        expect(new Set(items.map(item => item.title)).size, 'every work item has its own name').toBe(15);
        expect(people.items.map(person => person.name)).toEqual(['Maya Chen', 'Jonas Berg', 'Priya Nair', 'Tom Okafor', 'Lena Fischer', 'Sam Rivera']);

        for (const item of first.items) {
            expect(keys.has(item.resourceId), `${item.id} belongs to a person of the team`).toBe(true);
            expect(STATUSES, `${item.id} sits in a board column`).toContain(item.status);
            expect(Number.isFinite(item.order), `${item.id} has a rank in its column`).toBe(true);
            expect(item.startDate < item.endDate, `${item.id} spans time`).toBe(true);
            expect(item.startDate >= start && item.endDate <= end, `${item.id} lies in the planning calendar's window`).toBe(true)
        }

        for (const person of keys) {
            const own = first.items.filter(item => item.resourceId === person).sort((a, b) => a.startDate - b.startDate);

            own.slice(1).forEach((item, index) => expect(item.startDate >= own[index].endDate,
                `${item.id} starts after ${own[index].id} ends: one lane per person`).toBe(true))
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

test('the planning calendar starts on a Monday and holds the whole plan, whatever weekday the plan day falls on', () => {
    for (let offset = 0; offset < 7; offset++) {
        const day          = at(offset),
              tasks        = Neo.create(PlanTasks, {baseDate: day}),
              items        = Neo.create(WorkItems, {baseDate: day}),
              {end, start} = planWindow(day);

        try {
            expect(start.getUTCDay(), `${day.toISOString()}: the window opens on a Monday`).toBe(1);
            expect(end - start, 'five whole weeks').toBe(35 * DAY);

            for (const record of [...tasks.items, ...items.items]) {
                expect(record.startDate >= start && record.endDate <= end, `${day.toISOString()}: ${record.id} lies in the window`).toBe(true)
            }
        } finally {
            tasks.destroy();
            items.destroy()
        }
    }
});

test('a work item\'s days are named the calendar\'s way, the exclusive end read as its last day', () => {
    expect(daysLabel(at(1), at(5))).toBe('17–20 Nov');
    expect(daysLabel(at(12), at(18)), 'across a month').toBe('28 Nov – 3 Dec');
    expect(daysLabel(at(1), at(2)), 'one day').toBe('17 Nov')
});

test('each board column wears the colour the schedule dresses its status\'s bars in', () => {
    const colors = Object.fromEntries(BoardPane.config.columns.map(column => [column.status, column.color]));

    expect(Object.keys(colors), 'one column per work-item status, in the order work moves').toEqual(STATUSES);

    for (const [status, cls] of Object.entries(SchedulerPane.statusBarCls)) {
        const variant = cls.match(/^neo-scheduler-bar-(\w+)$/)?.[1];

        variant && expect(colors[status], `${status} reads its bars' border`).toBe(`var(--neo-scheduler-bar-${variant}-border)`)
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
    let board, pane, stores;

    test.afterEach(() => {
        board?.destroy();
        pane?.destroy();
        stores?.forEach(store => store.destroy());
        board = pane = stores = null
    });

    /** The bars the schedule renders in one person's row. */
    const rowBars = (scheduler, index) => (scheduler.body.items[index]?.vdom?.cn?.[0]?.cn?.[0]?.cn?.[0]?.cn || [])
        .filter(node => node.cls?.includes('neo-timeline-bar'));

    /** A card's footer: the days it names and the person its avatar names. */
    const footer = card => {
        const node = card.vdom.cn.find(item => item.cls?.includes('workstation-card-plan'));

        return node && {days: node.cn[0].text, person: node.cn[1]?.cn?.[0]?.title ?? null}
    };

    /** The avatar that a card currently renders for its person. */
    const avatar = card => card.vdom.cn.find(item => item.cls?.includes('workstation-card-plan'))?.cn[1]?.cn[0];

    test('a direct or batched People rename only repaints cards assigned to those people', () => {
        const people    = Neo.create(People),
              workItems = Neo.create(WorkItems, {baseDate: BASE});

        stores = [people, workItems];
        board  = Neo.create(BoardPane, {appName, people, store: workItems});

        const maya        = board.getCard('wi-1'),
              jonas       = board.getCard('wi-3'),
              untouched   = avatar(jonas),
              renderItems = maya.renderItems,
              workChanges = [];
        let paints = 0;

        maya.renderItems = function() {
            paints++;
            renderItems.call(this)
        };
        workItems.on('recordChange', ({record}) => workChanges.push(record.id));
        expect(avatar(maya)).toMatchObject({title: 'Maya Chen', text: 'MC'});

        people.get('maya').name = 'Zara Vale';
        expect(avatar(maya)).toMatchObject({title: 'Zara Vale', text: 'ZV'});
        expect(paints).toBe(1);

        people.updateRows([{key: 'maya', values: {name: 'Avery Stone'}}]);
        expect(avatar(maya)).toMatchObject({title: 'Avery Stone', text: 'AS'});
        expect(paints).toBe(2);
        expect(avatar(jonas)).toBe(untouched);
        expect(avatar(jonas)).toMatchObject({title: 'Jonas Berg', text: 'JB'});
        expect(workChanges).toEqual([])
    });

    test('People replacement and membership changes clear stale avatars and release borrowed listeners', () => {
        const people      = Neo.create(People),
              replacement = Neo.create(People, {data: [{id: 'maya', name: 'Casey Jones'}]}),
              workItems   = Neo.create(WorkItems, {baseDate: BASE});

        stores = [people, replacement, workItems];
        board  = Neo.create(BoardPane, {appName, people, store: workItems});

        const card    = board.getCard('wi-1'),
              un      = replacement.un,
              removed = [];

        replacement.un = function(listeners, ...args) {
            if (listeners.scope === board) removed.push(...Object.keys(listeners));
            return un.call(this, listeners, ...args)
        };

        board.people = replacement;
        const current = avatar(card);
        expect(current).toMatchObject({title: 'Casey Jones', text: 'CJ'});

        people.get('maya').name = 'Old store edit';
        expect(avatar(card)).toBe(current);

        replacement.remove('maya');
        expect(avatar(card)).toBeUndefined();

        replacement.data = [{id: 'maya', name: 'Morgan Quinn'}];
        expect(avatar(card)).toMatchObject({title: 'Morgan Quinn', text: 'MQ'});

        replacement.updateKey(replacement.get('maya'), 'elsewhere');
        expect(avatar(card)).toBeUndefined();

        replacement.add({id: 'maya', name: 'Taylor Lee'});
        expect(avatar(card)).toMatchObject({title: 'Taylor Lee', text: 'TL'});

        board.destroy();
        expect(removed.sort()).toEqual(['filter', 'load', 'recordChange', 'rowsChange', 'scope', 'updateKey']);
        expect(replacement.isDestroyed).toBeFalsy();
        expect(people.isDestroyed).toBeFalsy();
        replacement.get('maya').name = 'Still writable';
        expect(replacement.get('maya').name).toBe('Still writable');
        board = null
    });

    test('the board and the schedule are two views of one store: a card move is one record change its bar shows, a bar move changes the days its card shows', () => {
        const people    = Neo.create(People),
              workItems = Neo.create(WorkItems, {baseDate: BASE}),
              changes   = [];

        stores = [people, workItems];
        board  = Neo.create(BoardPane, {appName, people, store: workItems});
        pane   = Neo.create(SchedulerPane, {
            ...planningAxis(BASE),
            appName,
            eventStore   : workItems,
            store        : people,
            viewportWidth: 1600
        });

        pane.body.set({availableHeight: 400, containerWidth: 1600});
        pane.timelineColumn.refreshMountedRows();

        const record = workItems.get('wi-9'),
              bar    = () => rowBars(pane, people.indexOf(people.get('tom'))).find(node => node.data.eventId === 'wi-9');

        expect(board.items.map(column => column.count), 'three work items in each status').toEqual([3, 3, 3, 3, 3]);
        expect(footer(board.getCard(record)), 'a card names its days and its person').toEqual({days: '18–22 Nov', person: 'Tom Okafor'});

        workItems.on('recordChange', ({fields, record}) => changes.push({id: record.id, fields: fields.map(field => field.name).sort()}));

        // A card moved into Done on the board
        board.moveCard({record, status: 'done', index: 0});

        expect(changes).toEqual([{id: 'wi-9', fields: ['order', 'status']}]);
        expect(board.getCardPosition(record)).toMatchObject({index: 0, status: 'done'});
        expect(bar().data.status, 'the bar shows the card\'s new column').toBe('done');
        expect(bar().cls).toContain('neo-scheduler-bar-emerald');

        // A bar moved in the schedule
        changes.length = 0;
        expect(pane.moveEvent('wi-9', {startDate: at(3), endDate: at(8)}, {source: 'keyboard'})).toBeTruthy();

        expect(changes).toEqual([{id: 'wi-9', fields: ['endDate', 'startDate']}]);
        expect(footer(board.getCard(record)).days, 'the card shows the new days').toBe('19–23 Nov');
        expect(board.getCardPosition(record).status, 'and keeps its column').toBe('done')
    });

    test('a schedule-editor save names every day its bar takes: an end at noon closes its own day, an end at midnight the day before', () => {
        const people    = Neo.create(People),
              workItems = Neo.create(WorkItems, {baseDate: BASE});

        stores = [people, workItems];
        board  = Neo.create(BoardPane, {appName, people, store: workItems});
        pane   = Neo.create(SchedulerPane, {...planningAxis(BASE), appName, eventStore: workItems, store: people, viewportWidth: 1600});

        const record = workItems.get('wi-9'),
              save   = (startDate, endDate) => {
                  const editor = pane.openEventEditor('wi-9');

                  editor.setFieldValue('startDate', startDate);
                  editor.setFieldValue('endDate',   endDate);
                  editor.save()
              };

        save('2026-11-18T00:00', '2026-11-20T12:00');
        expect(record.endDate.toISOString(), 'the editor keeps an end inside a day, despite the daily snap').toBe('2026-11-20T12:00:00.000Z');
        expect(footer(board.getCard(record)).days).toBe('18–20 Nov');

        save('2026-11-18T00:00', '2026-11-20T00:00');
        expect(footer(board.getCard(record)).days, 'an end at midnight closes the day before').toBe('18–19 Nov');

        save('2026-11-18T00:00', '2026-11-19T00:00');
        expect(footer(board.getCard(record)).days, 'one day').toBe('18 Nov')
    });

    test('a card\'s editor offers the work item\'s own fields, its person among the team; a person chosen there moves the bar', () => {
        const people    = Neo.create(People),
              workItems = Neo.create(WorkItems, {baseDate: BASE});

        stores = [people, workItems];
        board  = Neo.create(BoardPane, {appName, people, store: workItems});
        pane   = Neo.create(SchedulerPane, {
            ...planningAxis(BASE),
            appName,
            eventStore   : workItems,
            store        : people,
            viewportWidth: 1600
        });

        pane.body.set({availableHeight: 400, containerWidth: 1600});
        pane.timelineColumn.refreshMountedRows();

        const editor = board.openCardEditor('wi-9'),
              person = editor.getField('resourceId');

        expect([...editor.fieldMap.keys()], 'no fields the work item lacks; its days stay the schedule\'s').toEqual(['title', 'status', 'resourceId', 'progress', 'description']);
        expect([person.labelText, person.store], 'the person is chosen in the team store itself').toEqual(['Person', people]);

        editor.setFieldValue('resourceId', 'maya');

        expect(editor.save()).toEqual({resourceId: 'maya'});
        expect(rowBars(pane, people.indexOf(people.get('maya'))).map(node => node.data.eventId), 'the bar moves to her row').toContain('wi-9');
        expect(people.isDestroyed, 'and the editor borrows the team, never owns it').toBeFalsy()
    });

    test('a status written to the shared record repaints its bar; a bar moved in the schedule is one record change', () => {
        const people    = Neo.create(People),
              workItems = Neo.create(WorkItems, {baseDate: BASE}),
              changes   = [];

        stores = [people, workItems];
        pane   = Neo.create(SchedulerPane, {
            ...planningAxis(BASE),
            appName,
            eventStore   : workItems,
            store        : people,
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
        expect(pane.moveEvent('wi-9', {startDate: at(3), endDate: at(8)}, {source: 'keyboard'})).toBeTruthy();

        expect(changes).toEqual([{id: 'wi-9', fields: ['endDate', 'startDate']}]);
        expect(workItems.get('wi-9').startDate.toISOString(), 'the record holds the new dates').toBe(at(3).toISOString())
    });

    test('a subclass\'s status classes dress its bars: the renderer reads them from the pane it renders for', () => {
        const people    = Neo.create(People),
              workItems = Neo.create(WorkItems, {baseDate: BASE});

        stores = [people, workItems];
        pane   = Neo.create(ReviewedSchedulerPane, {
            ...planningAxis(BASE),
            appName,
            eventStore   : workItems,
            store        : people,
            viewportWidth: 1600
        });

        pane.body.set({availableHeight: 400, containerWidth: 1600});
        pane.timelineColumn.refreshMountedRows();

        const bars   = rowBars(pane, people.indexOf(people.get('tom'))),
              review = bars.find(node => node.data.eventId === 'wi-8');

        expect(review.data.status).toBe('review');
        expect(review.cls, 'the subclass names the review bar').toContain('reviewed-plan-bar');
        expect(review.cls, 'in place of the base class\'s').not.toContain('neo-scheduler-bar-violet');
        expect(bars.find(node => node.data.eventId === 'wi-7').cls, 'a status it keeps still reads the base map')
            .toContain('neo-scheduler-bar-amber')
    });

    test('the schedule and the release plan draw on one calendar: one window, one scale, one locked width, one label', () => {
        const people    = Neo.create(People),
              workItems = Neo.create(WorkItems, {baseDate: BASE}),
              tasks     = Neo.create(PlanTasks, {baseDate: BASE}),
              links     = Neo.create(PlanLinks),
              plan      = Neo.create(GanttPane, {...planningAxis(BASE), appName, dependencyStore: links, store: tasks});

        stores = [people, workItems, tasks, links];
        pane   = Neo.create(SchedulerPane, {...planningAxis(BASE), appName, eventStore: workItems, store: people});

        try {
            const tick = {date: at(0)};

            for (const key of ['start', 'end']) {
                expect(pane.timeAxis[key].getTime(), `the panes share the window's ${key}`).toBe(plan.timeAxis[key].getTime())
            }

            expect(pane.timeAxis.effectivePxPerMinute, 'and its scale').toBe(plan.timeAxis.effectivePxPerMinute);
            expect([pane.resourceColumns[0].width, plan.taskColumns[0].width], 'and the locked width').toEqual([lockedWidth, lockedWidth]);
            expect([pane.majorFormatter(tick), pane.minorFormatter(tick)], 'and the labels').toEqual([plan.majorFormatter(tick), plan.minorFormatter(tick)]);
            expect(plan.taskColumns[0].text, 'the tree column names its rows').toBe('Phase')
        } finally {
            plan.destroy()
        }
    });

    test('a task moved in the release plan moves its linked successors with it', () => {
        const tasks = Neo.create(PlanTasks, {baseDate: BASE}),
              links = Neo.create(PlanLinks),
              start = id => tasks.get(id).startDate.toISOString();

        stores = [tasks, links];
        pane   = Neo.create(GanttPane, {...planningAxis(BASE), appName, dependencyStore: links, store: tasks});

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
