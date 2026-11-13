import {setup} from '../../setup.mjs';

const appName = 'TestApp';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import { test, expect }   from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import CalendarsStore     from '../../../../src/calendar/store/Calendars.mjs';
import EventsStore        from '../../../../src/calendar/store/Events.mjs';
import WeekComponent      from '../../../../src/calendar/view/week/Component.mjs';
import WeekDragDrop       from '../../../../src/calendar/view/week/plugin/DragDrop.mjs';

test.describe('Neo.calendar.view.week.Component - Issue #19930 & #1069', () => {
    let originalScrollBy,
        originalSetConfigs,
        scrollByCalls;

    test.beforeEach(() => {
        scrollByCalls      = [];
        originalScrollBy   = Neo.main.DomAccess.scrollBy;
        originalSetConfigs = Neo.main.addon.DragDrop.setConfigs;

        Neo.main.DomAccess.scrollBy = async (data) => {
            scrollByCalls.push(data);
        };
    });

    test.afterEach(() => {
        Neo.main.DomAccess.scrollBy        = originalScrollBy;
        Neo.main.addon.DragDrop.setConfigs = originalSetConfigs;
    });

    test('Constructs cleanly when currentDate is null and updates header when set', async () => {
        let component;

        expect(() => {
            component = Neo.create({
                className    : 'Neo.calendar.view.week.Component',
                appName,
                calendarStore: Neo.create('Neo.calendar.store.Calendars'),
                currentDate  : null,
                eventStore   : Neo.create('Neo.calendar.store.Events')
            });
        }).not.toThrow();

        expect(component).toBeDefined();

        expect(() => {
            component.currentDate = new Date();
        }).not.toThrow();

        const cells = component.getHeaderContainer().cn.filter(cell => cell.cls?.includes('neo-header-row-item'));
        expect(cells.length).toBe(component.totalColumns);

        component.destroy();
    });

    test('changing columnsBuffer or columnsVisible at runtime rebuilds columns and headers to match totalColumns (#20766)', async () => {
        const component = Neo.create({
            className      : 'Neo.calendar.view.week.Component',
            appName,
            calendarStore  : Neo.create('Neo.calendar.store.Calendars'),
            currentDate    : new Date(2026, 4, 13),
            enableDrag     : false,
            endTime        : '24:00',
            eventStore     : Neo.create('Neo.calendar.store.Events'),
            intlFormat_time: new Intl.DateTimeFormat('en-US', {hour: '2-digit', minute: '2-digit'}),
            startTime      : '00:00',
            weekStartDay   : 0
        });

        component.timeout = () => Promise.resolve();

        await component.initVnode();
        component._mounted = true;
        await component.afterSetMounted(true, false);

        const getFlags     = () => component.getColumnContainer().cn.map(col => col.flag),
              getHeaderIds = () => component.getHeaderContainer().cn.map(item => item.id),
              expectLayout = (totalColumns, firstFlag, lastFlag) => {
                  const flags = getFlags();

                  expect(component.totalColumns).toBe(totalColumns);
                  expect(flags.length).toBe(totalColumns);
                  expect(flags[0]).toBe(firstFlag);
                  expect(flags.at(-1)).toBe(lastFlag);
                  expect(getHeaderIds()).toEqual(flags.map(flag => `${component.id}_ch_${flag}`))
              };

        expectLayout(21, '2026-05-03', '2026-05-23');

        // Decrease: no stale trailing columns or headers
        component.columnsBuffer = 5;
        expectLayout(17, '2026-05-05', '2026-05-21');

        component.columnsVisible = 5;
        expectLayout(15, '2026-05-05', '2026-05-19');

        // Later currentDate transitions use the new column count
        component.currentDate = new Date(2026, 5, 3);
        expectLayout(15, '2026-05-26', '2026-06-09');

        // Increase: updateHeader() must not hit missing columns
        expect(() => {component.columnsBuffer = 9}).not.toThrow();
        expectLayout(23, '2026-05-22', '2026-06-13');

        expect(() => {component.columnsVisible = 7}).not.toThrow();
        expectLayout(25, '2026-05-22', '2026-06-15');

        component.destroy();
    });

    test('onScroll pages buffered columns at right and left edges, preserves deterministic column/header IDs, and ignores vertical scroll on the scroll container (#1069)', async () => {
        const component = Neo.create({
            className      : 'Neo.calendar.view.week.Component',
            appName,
            calendarStore  : Neo.create('Neo.calendar.store.Calendars'),
            currentDate    : new Date(2026, 4, 13),
            enableDrag     : false,
            endTime        : '24:00',
            eventStore     : Neo.create('Neo.calendar.store.Events'),
            intlFormat_time: new Intl.DateTimeFormat('en-US', {hour: '2-digit', minute: '2-digit'}),
            startTime      : '00:00',
            weekStartDay   : 0
        });

        component.timeout = () => Promise.resolve();

        await component.initVnode();
        component._mounted = true;
        await component.afterSetMounted(true, false);

        const scrollContainer = component.getScrollContainer(),
              getColumnFlags  = () => component.getColumnContainer().cn.map(col => col.flag),
              initialFlags    = getColumnFlags();

        expect(initialFlags.length).toBe(21);

        let lastPromiseUpdate;
        const origPromiseUpdate = component.promiseUpdate.bind(component);
        component.promiseUpdate = (...args) => {
            lastPromiseUpdate = origPromiseUpdate(...args);
            return lastPromiseUpdate;
        };

        // 1. Vertical-only scroll events on .neo-c-w-scrollcontainer (including at scrollLeft = 0) are ignored
        scrollByCalls.length = 0;

        component.onScroll({
            clientWidth: 750,
            scrollLeft : 0,
            scrollTop  : 150,
            target     : {cls: ['neo-c-w-scrollcontainer'], id: scrollContainer.id}
        });

        component.onScroll({
            clientWidth: 750,
            scrollLeft : 0,
            scrollTop  : 320,
            target     : {cls: ['neo-c-w-scrollcontainer'], id: scrollContainer.id}
        });

        expect(getColumnFlags()).toEqual(initialFlags);
        expect(scrollByCalls).toEqual([]);

        // 2. Center baseline scroll on .neo-c-w-scrollcontainer, followed by vertical scroll at scrollLeft = 700
        component.onScroll({
            clientWidth: 750,
            scrollLeft : 700,
            scrollTop  : 100,
            target     : {cls: ['neo-c-w-scrollcontainer'], id: scrollContainer.id}
        });

        component.onScroll({
            clientWidth: 750,
            scrollLeft : 700,
            scrollTop  : 280,
            target     : {cls: ['neo-c-w-scrollcontainer'], id: scrollContainer.id}
        });

        expect(getColumnFlags()).toEqual(initialFlags);
        expect(scrollByCalls).toEqual([]);

        // 3. Drag-scroll to right edge (scrollLeft = 1400, width = 700 -> Math.round(1400/700*7) = 14 > 13)
        scrollByCalls.length = 0;

        component.onScroll({
            clientWidth: 750,
            scrollLeft : 1400,
            target     : {cls: ['neo-c-w-scrollcontainer'], id: scrollContainer.id}
        });

        await lastPromiseUpdate;
        await Promise.resolve();

        const afterRightFlags = getColumnFlags();
        expect(afterRightFlags.length).toBe(21);
        expect(afterRightFlags.slice(0, 14)).toEqual(initialFlags.slice(7, 21));

        // Verify newly created right-edge columns and headers carry deterministic IDs matching updateHeader()
        const lastCol    = component.getColumnContainer().cn[20],
              lastHeader = component.getHeaderContainer().cn[20];
        expect(lastCol.id).toBe(`${component.id}_col_${lastCol.flag}`);
        expect(lastHeader.id).toBe(`${component.id}_ch_${lastCol.flag}`);

        expect(scrollByCalls).toEqual([{
            direction: 'left',
            id       : scrollContainer.id,
            value    : -700,
            windowId : component.windowId
        }]);

        // 4. Drag-scroll to left edge (scrollLeft = 0, width = 700 -> Math.round(0/700*7) = 0 < 1)
        scrollByCalls.length = 0;

        component.onScroll({
            clientWidth: 750,
            scrollLeft : 0,
            target     : {cls: ['neo-c-w-scrollcontainer'], id: scrollContainer.id}
        });

        await lastPromiseUpdate;
        await Promise.resolve();

        expect(getColumnFlags()).toEqual(initialFlags);
        expect(scrollByCalls).toEqual([{
            direction: 'left',
            id       : scrollContainer.id,
            value    : 700,
            windowId : component.windowId
        }]);

        component.destroy();
    });

    test('week.plugin.DragDrop#getEventDragZone and EventDragZone#dragStart sync scrollContainerId across multiple drags (#1069)', async () => {
        const setConfigsCalls = [];

        Neo.main.addon.DragDrop.setConfigs = async (data) => {
            setConfigsCalls.push(data);
            return {boundaryContainerRect: null};
        };

        const component = Neo.create({
            className      : 'Neo.calendar.view.week.Component',
            appName,
            calendarStore  : Neo.create('Neo.calendar.store.Calendars'),
            currentDate    : new Date(2026, 4, 13),
            enableDrag     : false,
            endTime        : '24:00',
            eventStore     : Neo.create('Neo.calendar.store.Events'),
            intlFormat_time: new Intl.DateTimeFormat('en-US', {hour: '2-digit', minute: '2-digit'}),
            startTime      : '00:00'
        });

        component.timeout = () => Promise.resolve();

        await component.initVnode();
        component._mounted = true;
        await component.afterSetMounted(true, false);

        const plugin = Neo.create({
            className: 'Neo.calendar.view.week.plugin.DragDrop',
            appName,
            owner    : component,
            windowId : component.windowId
        });

        const dragElement = {
            id : `${component.id}__event_1`,
            cls: ['neo-event'],
            cn : [
                {id: `${component.id}__time__1`, text: '09:00'},
                {id: `${component.id}__title__1`, text: 'Sync'},
                {id: `${component.id}__enddate__1`, text: '10:00', removeDom: true}
            ]
        };

        const eventRecord = {
            startDate: new Date(2026, 4, 13, 9, 0),
            endDate  : new Date(2026, 4, 13, 10, 0),
            set      : () => {}
        };

        const columnId = component.getColumnContainer().cn[7].id;

        const dragZone = plugin.getEventDragZone({
            dragElement,
            enableResizingAcrossOppositeEdge: true,
            eventRecord,
            proxyParentId                   : columnId
        });

        expect(dragZone.scrollContainerId).toBe(component.getScrollContainer().id);

        component.getDomRect = async () => [
            {left: 100, top: 100, width: 120, height: 50, x: 100, y: 100},
            {left: 100, top: 50,  width: 120, height: 600, x: 100, y: 50}
        ];

        await dragZone.dragStart({
            clientX   : 110,
            clientY   : 110,
            path      : [dragElement, {id: columnId, cls: ['neo-c-w-column']}],
            targetPath: [dragElement, {id: columnId, cls: ['neo-c-w-column']}]
        });

        expect(setConfigsCalls.length).toBe(1);
        expect(setConfigsCalls[0].scrollContainerId).toBe(component.getScrollContainer().id);
        expect(setConfigsCalls[0].scrollFactorLeft).toBe(3);

        // Simulate dragEnd clearing scrollContainerId = null (via DragZone.prototype.dragEnd)
        dragZone.scrollContainerId = null;
        if (dragZone.dragProxy) {
            dragZone.dragProxy.destroy();
            dragZone.dragProxy = null;
        }

        // Second drag must restore scrollContainerId via getEventDragZone(opts) -> eventDragZone.set(config)
        plugin.getEventDragZone({
            dragElement,
            enableResizingAcrossOppositeEdge: true,
            eventRecord,
            proxyParentId                   : columnId
        });

        expect(dragZone.scrollContainerId).toBe(component.getScrollContainer().id);

        dragZone.destroy();
        plugin.destroy();
        component.destroy();
    });

    test('destroying the week view destroys owner.eventDragZone when created and does not throw when never created', async () => {
        // AC-2: Destroying a week view with DragDrop plugin when no drag occurred does not throw
        const idleView = Neo.create({
            className      : 'Neo.calendar.view.week.Component',
            appName,
            calendarStore  : Neo.create('Neo.calendar.store.Calendars'),
            currentDate    : new Date(2026, 4, 13),
            enableDrag     : false,
            endTime        : '24:00',
            eventStore     : Neo.create('Neo.calendar.store.Events'),
            intlFormat_time: new Intl.DateTimeFormat('en-US', {hour: '2-digit', minute: '2-digit'}),
            plugins        : [{module: WeekDragDrop, appName}],
            startTime      : '00:00'
        });

        expect(idleView.getPlugin('calendar-week-dragdrop')).toBeDefined();
        expect(idleView.eventDragZone).toBeNull();
        expect(() => idleView.destroy()).not.toThrow();

        // AC-1: After a drag created the zone, destroying the week view also destroys that zone
        const draggedView = Neo.create({
            className      : 'Neo.calendar.view.week.Component',
            appName,
            calendarStore  : Neo.create('Neo.calendar.store.Calendars'),
            currentDate    : new Date(2026, 4, 13),
            enableDrag     : false,
            endTime        : '24:00',
            eventStore     : Neo.create('Neo.calendar.store.Events'),
            intlFormat_time: new Intl.DateTimeFormat('en-US', {hour: '2-digit', minute: '2-digit'}),
            plugins        : [{module: WeekDragDrop, appName}],
            startTime      : '00:00'
        });

        const dragDropPlugin = draggedView.getPlugin('calendar-week-dragdrop'),
              columnId       = draggedView.getColumnContainer().cn[7].id,
              dragElement    = {
                  id : `${draggedView.id}__event_1`,
                  cls: ['neo-event'],
                  cn : []
              },
              eventRecord    = {
                  startDate: new Date(2026, 4, 13, 9, 0),
                  endDate  : new Date(2026, 4, 13, 10, 0),
                  set      : () => {}
              };

        const dragZone = dragDropPlugin.getEventDragZone({
            dragElement,
            enableResizingAcrossOppositeEdge: true,
            eventRecord,
            proxyParentId                   : columnId
        });

        expect(draggedView.eventDragZone).toBe(dragZone);
        expect(dragZone.isDestroyed).toBeFalsy();

        draggedView.destroy();

        expect(dragZone.isDestroyed).toBe(true);
        expect(draggedView.eventDragZone).toBeNull();
    });

    test('a week drop commits through record.set on a standalone store, without a StateProvider (#20768)', async () => {
        const originalApplyDeltas = Neo.applyDeltas,
              originalDragDrop    = Neo.main.addon.DragDrop;

        Neo.applyDeltas = async () => {};

        Neo.main.addon.DragDrop = {
            registerZone       : async () => {},
            setConfigs         : async () => ({boundaryContainerRect: {height: 600, left: 0, top: 0, width: 800}}),
            setDragProxyElement: async () => {},
            unregisterZone     : async () => {}
        };

        const createWeek = async () => {
            const calendarStore = Neo.create(CalendarsStore, {data: [{active: true, color: 'blue', id: 1, name: 'Work'}]}),
                  eventStore    = Neo.create(EventsStore, {data: [
                      {calendarId: 1, id: 101, title: 'A', startDate: new Date(2026, 4, 12, 9, 0), endDate: new Date(2026, 4, 12, 10, 0)},
                      {calendarId: 1, id: 102, title: 'B', startDate: new Date(2026, 4, 13, 9, 0), endDate: new Date(2026, 4, 13, 10, 0)}
                  ]}),
                  component     = Neo.create(WeekComponent, {
                      appName, calendarStore, currentDate: new Date(2026, 4, 13), enableDrag: true,
                      endTime: '24:00', eventStore, intlFormat_time: new Intl.DateTimeFormat('en-US', {hour: '2-digit', minute: '2-digit'}),
                      plugins: [{module: WeekDragDrop, appName}], startTime: '00:00'
                  });

            component.timeout = () => Promise.resolve();
            await component.initVnode();
            component._mounted = true;

            const record   = eventStore.get(101),
                  dragZone = component.plugins[0].getEventDragZone({
                      dragElement                     : {id: `${component.id}__101`, cls: ['neo-event'], cn: []},
                      enableResizingAcrossOppositeEdge: true,
                      eventRecord                     : record,
                      proxyParentId                   : component.getColumnContainer().cn[7].id
                  }),
                  counts = {load: 0, recordChange: 0, updateEvents: 0, fields: []},
                  orig   = component.updateEvents.bind(component);

            component.updateEvents = (...args) => {counts.updateEvents++; return orig(...args)};
            eventStore.on('load', () => counts.load++);
            eventStore.on('recordChange', ({fields}) => {counts.recordChange++; counts.fields = fields.map(f => f.name)});

            return {component, counts, dragZone, eventStore, record};
        };

        try {
            // AC-1 week half & AC-2: a moved drop fires one recordChange naming both fields, re-sorts the
            // standalone store and runs updateEvents() only through the store's notifications.
            const moved = await createWeek();

            Object.assign(moved.dragZone, {keepStartDate: true, newStartDate: new Date(2026, 4, 14, 9, 0), newEndDate: new Date(2026, 4, 14, 10, 0)});
            moved.dragZone.dragEnd({});

            expect(moved.counts.recordChange).toBe(1);
            expect(moved.counts.fields).toEqual(['endDate', 'startDate']);
            expect(moved.eventStore.indexOf(moved.record)).toBe(1);
            expect(moved.counts.updateEvents).toBe(moved.counts.load + moved.counts.recordChange);
            moved.component.destroy();

            // AC-3 week arm: a same-slot drop fires no recordChange and restores the view once.
            const sameSlot = await createWeek();

            Object.assign(sameSlot.dragZone, {keepStartDate: true, newStartDate: null, newEndDate: new Date(+sameSlot.record.endDate)});
            sameSlot.dragZone.dragEnd({});

            expect(sameSlot.counts.recordChange).toBe(0);
            expect(sameSlot.counts.updateEvents).toBe(1);
            sameSlot.component.destroy();

            // AC-3 week arm: an Escape cancel commits nothing and restores the view once.
            const cancelled = await createWeek(),
                  before    = +cancelled.record.startDate;

            Object.assign(cancelled.dragZone, {keepStartDate: true, newStartDate: new Date(2026, 4, 14, 9, 0), newEndDate: new Date(2026, 4, 14, 10, 0)});
            cancelled.dragZone.dragEnd({cancelled: true});

            expect(cancelled.counts.recordChange).toBe(0);
            expect(+cancelled.record.startDate).toBe(before);
            expect(cancelled.counts.updateEvents).toBe(1);
            cancelled.component.destroy();
        } finally {
            Neo.applyDeltas         = originalApplyDeltas;
            Neo.main.addon.DragDrop = originalDragDrop;
        }
    });
});
