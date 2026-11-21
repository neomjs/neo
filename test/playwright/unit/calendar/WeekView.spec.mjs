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
import CalendarsStore     from '../../../../src/calendar/store/Calendars.mjs';
import DayComponent       from '../../../../src/calendar/view/DayComponent.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import EditEventContainer from '../../../../src/calendar/view/EditEventContainer.mjs';
import EventsStore        from '../../../../src/calendar/store/Events.mjs';
import StateProvider      from '../../../../src/state/Provider.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import WeekComponent      from '../../../../src/calendar/view/week/Component.mjs';
import WeekDragDrop       from '../../../../src/calendar/view/week/plugin/DragDrop.mjs';

test.describe('Neo.calendar.view.week.Component - Issue #19930 & #1069', () => {
    let originalGetRect,
        originalScrollBy,
        originalScrollTo,
        originalSetConfigs,
        scrollByCalls;

    test.beforeEach(() => {
        scrollByCalls      = [];
        originalGetRect    = Neo.main.DomAccess.getBoundingClientRect;
        originalScrollBy   = Neo.main.DomAccess.scrollBy;
        originalScrollTo   = Neo.main.DomAccess.scrollTo;
        originalSetConfigs = Neo.main.addon.DragDrop.setConfigs;

        Neo.main.DomAccess.scrollBy = async (data) => {
            scrollByCalls.push(data);
        };
    });

    test.afterEach(() => {
        Neo.main.DomAccess.getBoundingClientRect = originalGetRect;
        Neo.main.DomAccess.scrollBy              = originalScrollBy;
        Neo.main.DomAccess.scrollTo              = originalScrollTo;
        Neo.main.addon.DragDrop.setConfigs       = originalSetConfigs;
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
        const scrollToCalls = [];

        // The geometry the scroll events below describe: 750 px wide, a 50 px time axis, 21 columns of 100 px
        Neo.main.DomAccess.getBoundingClientRect = async () => ({width: 2100, height: 1000, x: 0, y: 0});
        Neo.main.DomAccess.scrollTo              = async data => {scrollToCalls.push(data)};

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

        // 1. The mount scrolls to the middle third, and neither that scroll's own event nor a vertical-only scroll
        // event at the same scrollLeft pages
        expect(scrollToCalls.map(call => call.value)).toEqual([700]);

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

        // 2. Drag-scroll to right edge (scrollLeft = 1400, width = 700 -> Math.round(1400/700*7) = 14 > 13)
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

        // 3. Drag-scroll to left edge (scrollLeft = 0, width = 700 -> Math.round(0/700*7) = 0 < 1)
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

    const createCalendarFixture = async ({eventsData = [], module = WeekComponent, parent} = {}) => {
        const calendarStore = Neo.create(CalendarsStore, {
                  data: [
                      {active: true, color: 'blue',  id: 1, name: 'Work'},
                      {active: true, color: 'green', id: 2, name: 'Team'}
                  ]
              }),
              eventStore    = Neo.create(EventsStore, {data: eventsData}),
              component     = Neo.create(module, {
                  appName,
                  calendarStore,
                  currentDate    : new Date(2026, 4, 13),
                  enableDrag     : false,
                  endTime        : '24:00',
                  eventStore,
                  intlFormat_time: new Intl.DateTimeFormat('en-US', {hour: '2-digit', hour12: false, minute: '2-digit'}),
                  startTime      : '00:00',
                  weekStartDay   : 0,
                  ...(parent ? {parentId: parent.id} : {})
              });

        component.timeout = () => Promise.resolve();
        await component.initVnode();
        component._mounted = true;
        await component.afterSetMounted(true, false);

        return {calendarStore, component, eventStore};
    };

    test('all-day row stays out of the DOM when no all-day event overlaps the rendered range', async () => {
        const {calendarStore, component, eventStore} = await createCalendarFixture({
            eventsData: [{
                allDay    : false,
                calendarId: 1,
                id        : 1,
                title     : 'Timed meeting',
                startDate : new Date(2026, 4, 13, 9, 0),
                endDate   : new Date(2026, 4, 13, 10, 0)
            }]
        });

        const allDayRow = component.getAllDayContainer();

        expect(allDayRow.removeDom).toBe(true);
        expect(component.getAllDayLanesContainer().cn).toEqual([]);

        component.destroy();
        calendarStore.destroy();
        eventStore.destroy();
    });

    test('renders a single-day all-day event in the all-day row of both week and day views, and omits it from the time grid', async () => {
        for (const module of [WeekComponent, DayComponent]) {
            const {calendarStore, component, eventStore} = await createCalendarFixture({
                module,
                eventsData: [{
                    allDay    : true,
                    calendarId: 1,
                    id        : 10,
                    title     : 'Release freeze',
                    startDate : new Date(2026, 4, 13, 0, 0),
                    endDate   : new Date(2026, 4, 13, 23, 59)
                }]
            });

            const allDayRow = component.getAllDayContainer(),
                  bars      = component.getAllDayLanesContainer().cn,
                  cols      = component.getColumnContainer().cn,
                  targetCol = cols.find(col => col.flag === '2026-05-13'),
                  colCount  = cols.filter(col => !col.removeDom).length,
                  targetIdx = cols.findIndex(col => col.flag === '2026-05-13');

            expect(allDayRow.removeDom).toBe(false);
            expect(bars).toHaveLength(1);
            expect(bars[0].cls).toContain('neo-blue');
            expect(bars[0].cn[0].text).toBe('Release freeze');
            expect(bars[0].style.left).toBe(`calc(${(targetIdx / colCount * 100).toFixed(4)}% + 1px)`);
            expect(bars[0].style.width).toBe(`calc(${(1 / colCount * 100).toFixed(4)}% - 3px)`);
            expect(targetCol.cn).toEqual([]);

            component.destroy();
            calendarStore.destroy();
            eventStore.destroy();
        }
    });

    test('renders a 3-day all-day event across three columns and stacks overlapping bars into two lanes', async () => {
        const {calendarStore, component, eventStore} = await createCalendarFixture({
            eventsData: [{
                allDay    : true,
                calendarId: 1,
                id        : 20,
                title     : 'Architecture summit',
                startDate : new Date(2026, 4, 12, 0, 0),
                endDate   : new Date(2026, 4, 14, 23, 59)
            }, {
                allDay    : true,
                calendarId: 2,
                id        : 21,
                title     : 'Release freeze',
                startDate : new Date(2026, 4, 14, 0, 0),
                endDate   : new Date(2026, 4, 14, 23, 59)
            }]
        });

        const cols      = component.getColumnContainer().cn,
              startIdx  = cols.findIndex(col => col.flag === '2026-05-12'),
              lanesBox  = component.getAllDayLanesContainer(),
              bars      = lanesBox.cn,
              summitBar = bars.find(bar => bar.flag === 20),
              freezeBar = bars.find(bar => bar.flag === 21);

        expect(bars).toHaveLength(2);
        expect(summitBar.style.left).toBe(`calc(${(startIdx / 21 * 100).toFixed(4)}% + 1px)`);
        expect(summitBar.style.width).toBe(`calc(${(3 / 21 * 100).toFixed(4)}% - 3px)`);
        expect(freezeBar.style.top).not.toBe(summitBar.style.top);
        expect(lanesBox.style.height).toBe('56px');

        component.destroy();
        calendarStore.destroy();
        eventStore.destroy();
    });

    test('keeps all-day bars aligned with their day columns after scrolling horizontally in both directions', async () => {
        const {calendarStore, component, eventStore} = await createCalendarFixture({
            eventsData: [{
                allDay    : true,
                calendarId: 1,
                id        : 30,
                title     : 'Next week sprint',
                startDate : new Date(2026, 4, 18, 0, 0),
                endDate   : new Date(2026, 4, 20, 23, 59)
            }]
        });

        const expectAligned = () => {
            const cols     = component.getColumnContainer().cn,
                  startIdx = cols.findIndex(col => col.flag === '2026-05-18'),
                  bar      = component.getAllDayLanesContainer().cn.find(item => item.flag === 30);

            expect(bar.style.left).toBe(`calc(${(startIdx / 21 * 100).toFixed(4)}% + 1px)`);
            expect(bar.style.width).toBe(`calc(${(3 / 21 * 100).toFixed(4)}% - 3px)`)
        };

        expectAligned();

        component.onWheel({clientWidth: 750, deltaX: 1, deltaY: 0, scrollLeft: 1400});
        await expect.poll(() => component.isUpdating).toBe(false);
        expect(component.getColumnContainer().cn[0].flag).toBe('2026-05-10');
        expectAligned();

        component.onWheel({clientWidth: 750, deltaX: -1, deltaY: 0, scrollLeft: 0});
        await expect.poll(() => component.isUpdating).toBe(false);
        expect(component.getColumnContainer().cn[0].flag).toBe('2026-05-03');
        expectAligned();

        component.destroy();
        calendarStore.destroy();
        eventStore.destroy();
    });

    test('EditEventContainer sets and clears allDay with time field visibility and the week view moves the event', async () => {
        const provider = Neo.create(StateProvider, {
                  appName,
                  data: {
                      endTime             : '24:00',
                      minimumEventDuration: 30,
                      startTime           : '00:00',
                      timeFormatter       : new Intl.DateTimeFormat('en-US', {hour: '2-digit', hour12: false, minute: '2-digit'})
                  },
                  stores: {
                      calendars: {
                          module: CalendarsStore,
                          data  : [{active: true, color: 'blue', id: 1, name: 'Work'}]
                      },
                      events: {
                          module: EventsStore,
                          data  : [{
                              allDay    : false,
                              calendarId: 1,
                              id        : 40,
                              title     : 'Review',
                              startDate : new Date(2026, 4, 13, 9, 0),
                              endDate   : new Date(2026, 4, 13, 10, 0)
                          }]
                      }
                  }
              }),
              eventStore = provider.getStore('events'),
              weekView   = Neo.create(WeekComponent, {
                  appName,
                  calendarStore  : provider.getStore('calendars'),
                  currentDate    : new Date(2026, 4, 13),
                  enableDrag     : false,
                  endTime        : '24:00',
                  eventStore,
                  intlFormat_time: new Intl.DateTimeFormat('en-US', {hour: '2-digit', hour12: false, minute: '2-digit'}),
                  startTime      : '00:00',
                  weekStartDay   : 0
              }),
              editor     = Neo.create(EditEventContainer, {
                  appName,
                  stateProvider: provider
              }),
              record     = eventStore.get(40);

        weekView.timeout = () => Promise.resolve();
        await weekView.initVnode();
        weekView._mounted = true;
        await weekView.afterSetMounted(true, false);

        editor.record = record;
        await Promise.resolve();

        const allDayField = await editor.getField('allDay'),
              startField  = await editor.getField('startTime'),
              endField    = await editor.getField('endTime'),
              dayCol      = weekView.getColumnContainer().cn.find(col => col.flag === '2026-05-13');

        expect(allDayField.checked).toBe(false);
        expect(startField.hidden).toBe(false);
        expect(endField.hidden).toBe(false);
        expect(dayCol.cn).toHaveLength(1);
        expect(weekView.getAllDayContainer().removeDom).toBe(true);

        allDayField.checked = true;

        expect(record.allDay).toBe(true);
        await expect.poll(() => startField.hidden).toBe(true);
        await expect.poll(() => endField.hidden).toBe(true);
        expect(weekView.getAllDayContainer().removeDom).toBe(false);
        expect(weekView.getAllDayLanesContainer().cn).toHaveLength(1);
        expect(dayCol.cn).toEqual([]);

        allDayField.checked = false;

        expect(record.allDay).toBe(false);
        await expect.poll(() => startField.hidden).toBe(false);
        await expect.poll(() => endField.hidden).toBe(false);
        expect(weekView.getAllDayContainer().removeDom).toBe(true);
        expect(dayCol.cn).toHaveLength(1);

        editor.destroy();
        weekView.destroy();
        provider.destroy();
    });

    test('switching EditEventContainer between two all-day events preserves allDay on both records and cancels stale focus-leave unmount', async () => {
        const provider = Neo.create(StateProvider, {
                  appName,
                  data: {
                      endTime             : '24:00',
                      minimumEventDuration: 30,
                      startTime           : '00:00',
                      timeFormatter       : new Intl.DateTimeFormat('en-US', {hour: '2-digit', hour12: false, minute: '2-digit'})
                  },
                  stores: {
                      calendars: {
                          module: CalendarsStore,
                          data  : [{active: true, color: 'blue', id: 1, name: 'Work'}]
                      },
                      events: {
                          module: EventsStore,
                          data  : [{
                              allDay    : true,
                              calendarId: 1,
                              id        : 41,
                              title     : 'Architecture summit',
                              startDate : new Date(2026, 4, 12, 0, 0),
                              endDate   : new Date(2026, 4, 14, 23, 59)
                          }, {
                              allDay    : true,
                              calendarId: 1,
                              id        : 42,
                              title     : 'Release freeze',
                              startDate : new Date(2026, 4, 14, 0, 0),
                              endDate   : new Date(2026, 4, 14, 23, 59)
                          }]
                      }
                  }
              }),
              eventStore = provider.getStore('events'),
              weekView   = Neo.create(WeekComponent, {
                  appName,
                  calendarStore  : provider.getStore('calendars'),
                  currentDate    : new Date(2026, 4, 13),
                  enableDrag     : false,
                  endTime        : '24:00',
                  eventStore,
                  intlFormat_time: new Intl.DateTimeFormat('en-US', {hour: '2-digit', hour12: false, minute: '2-digit'}),
                  startTime      : '00:00',
                  weekStartDay   : 0
              }),
              editor     = Neo.create(EditEventContainer, {
                  appName,
                  stateProvider: provider
              }),
              summit     = eventStore.get(41),
              freeze     = eventStore.get(42);

        weekView.timeout = () => Promise.resolve();
        await weekView.initVnode();
        weekView._mounted = true;
        await weekView.afterSetMounted(true, false);

        editor.record = freeze;

        const allDayField   = editor.down({name: 'allDay'}),
              calendarField = editor.down({name: 'calendarId'}),
              startField    = editor.down({name: 'startTime'}),
              endField      = editor.down({name: 'endTime'}),
              titleField    = editor.down({name: 'title'});

        [titleField, calendarField, startField, endField].forEach(field => {
            field.updateCenterBorderElWidth = () => {}
        });

        expect(allDayField.checked).toBe(true);
        expect(allDayField.value).toBe(true);
        expect(titleField.value).toBe('Release freeze');
        expect(startField.hidden).toBe(true);
        expect(weekView.getAllDayLanesContainer().cn).toHaveLength(2);

        let resolveFocusTimer;
        editor.timeout        = () => new Promise(resolve => {resolveFocusTimer = resolve});
        editor._mounted       = true;
        editor._containsFocus = false;

        const focusLeavePromise = editor.onFocusLeave();

        editor.unmount();
        editor.setSilent({_hidden: false, record: summit});
        editor._mounted = true;
        editor.afterSetMounted(true, false);

        resolveFocusTimer();
        await focusLeavePromise;

        expect(freeze.allDay).toBe(true);
        expect(summit.allDay).toBe(true);
        expect(allDayField.checked).toBe(true);
        expect(allDayField.value).toBe(true);
        expect(titleField.value).toBe('Architecture summit');
        expect(startField.hidden).toBe(true);
        expect(endField.hidden).toBe(true);
        expect(editor.mounted).toBe(true);
        expect(weekView.getAllDayLanesContainer().cn).toHaveLength(2);

        editor.destroy();
        weekView.destroy();
        provider.destroy();
    });

    test('drag:cancel releases week.plugin.DragDrop across event move, event resize, and column drag-to-create without mutating eventStore (#21765)', async () => {
        const DomEvent         = (await import('../../../../src/manager/DomEvent.mjs')).default,
              EventResizable   = (await import('../../../../src/calendar/view/week/plugin/EventResizable.mjs')).default,
              VDomUtil         = (await import('../../../../src/util/VDom.mjs')).default,
              originalDeltas   = Neo.applyDeltas,
              originalDragDrop = Neo.main.addon.DragDrop,
              originalGetRect  = Neo.main.DomAccess.getBoundingClientRect;

        Neo.applyDeltas = async () => {};
        Neo.main.addon.DragDrop = {
            registerZone       : async () => {},
            setConfigs         : async () => ({boundaryContainerRect: {height: 600, left: 0, top: 0, width: 800}}),
            setDragProxyElement: async () => {},
            unregisterZone     : async () => {}
        };
        Neo.main.DomAccess.getBoundingClientRect = async ({id}) =>
            Array.isArray(id)
                ? id.map((_, index) => index === 0
                    ? {height: 50, left: 10, top: 225, width: 120, x: 10, y: 225}
                    : {height: 600, left: 10, top: 0, width: 120, x: 10, y: 0})
                : {height: 600, left: 0, top: 0, width: 800, x: 0, y: 0};

        try {
            const calendarStore = Neo.create(CalendarsStore, {data: [{active: true, color: 'blue', id: 1, name: 'Work'}]}),
                  eventStore    = Neo.create(EventsStore, {
                      data: [{
                          calendarId: 1,
                          endDate   : new Date(2026, 4, 12, 10, 0),
                          id        : 101,
                          startDate : new Date(2026, 4, 12, 9, 0),
                          title     : 'Standup'
                      }]
                  }),
                  component     = Neo.create(WeekComponent, {
                      appName,
                      calendarStore,
                      currentDate    : new Date(2026, 4, 13),
                      enableDrag     : true,
                      endTime        : '24:00',
                      eventStore,
                      intlFormat_time: new Intl.DateTimeFormat('en-US', {hour: '2-digit', minute: '2-digit'}),
                      plugins        : [{module: WeekDragDrop, appName}, {module: EventResizable, appName}],
                      startTime      : '00:00',
                      stateProvider  : {
                          data  : {
                              activeCalendarId    : 1,
                              currentDate         : new Date(2026, 4, 13),
                              endTime             : '24:00',
                              events              : {enableResizingAcrossOppositeEdge: true},
                              minimumEventDuration: 30,
                              showWeekends        : true,
                              startTime           : '00:00',
                              weekStartDay        : 0
                          },
                          stores: {calendars: calendarStore, events: eventStore}
                      }
                  });

            component.timeout = () => Promise.resolve();
            await component.initVnode();
            component._mounted = true;
            await component.afterSetMounted(true, false);

            const plugin      = component.getPlugin('calendar-week-dragdrop'),
                  resizable   = component.getPlugin('calendar-week-eventresizable'),
                  eventResult = VDomUtil.find(component.vdom, `${component.id}__101`),
                  sourceCol   = eventResult.parentNode,
                  columns     = component.getColumnContainer().cn.filter(node => node.cls?.includes('neo-c-w-column')),
                  targetCol   = columns.find(col => col.id !== sourceCol.id),
                  eventNodeId = `${component.id}__101`,
                  eventPath   = [
                      {id: eventNodeId,  cls: ['neo-event', 'neo-draggable'], rect: {height: 50, left: 10, top: 225, width: 120}},
                      {id: sourceCol.id, cls: ['neo-c-w-column'],             rect: {height: 600, left: 10, top: 0, width: 120}},
                      {id: component.id, cls: ['neo-calendar-weekcomponent']}
                  ];

            // 1. Event move cancelled via `drag:cancel` (`pointercancel`) resets `plugin.isDragging` and preserves dates
            DomEvent.fire({
                data     : {clientX: 40, clientY: 240, path: eventPath, targetPath: eventPath},
                eventName: 'drag:start',
                windowId : component.windowId
            });
            await expect.poll(() => Boolean(component.eventDragZone?.dragProxy), {interval: 5, timeout: 500}).toBe(true);

            expect(plugin.isDragging).toBe(true);
            plugin.onEventDragMove({
                clientX   : 180,
                clientY   : 360,
                path      : eventPath,
                targetPath: [{id: targetCol.id, cls: ['neo-c-w-column']}]
            });

            DomEvent.fire({
                data     : {dragZoneId: component.eventDragZone.id, path: eventPath, targetPath: eventPath},
                eventName: 'drag:cancel',
                windowId : component.windowId
            });

            expect(plugin.isDragging, 'event move drag:cancel resets isDragging').toBe(false);
            expect(component.eventDragZone.dragProxy).toBeNull();
            expect(+eventStore.get(101).startDate).toBe(+new Date(2026, 4, 12, 9, 0));

            // 2. Event resize cancelled via `drag:cancel` resets both `plugin.isDragging` and `resizable.isDragging`
            resizable.currentNodeName = 'bottom';
            const resizePath = [
                {id: `${eventNodeId}__resize`, cls: ['neo-resizable', 'neo-resizable-bottom']},
                ...eventPath
            ];

            DomEvent.fire({
                data     : {clientX: 40, clientY: 274, path: [...resizePath], targetPath: [...resizePath]},
                eventName: 'drag:start',
                windowId : component.windowId
            });
            await Promise.resolve();
            await Promise.resolve();

            expect(plugin.isDragging).toBe(true);
            expect(resizable.isDragging).toBe(true);

            DomEvent.fire({
                data     : {dragZoneId: component.eventDragZone.id, path: [...resizePath], targetPath: [...resizePath]},
                eventName: 'drag:cancel',
                windowId : component.windowId
            });

            expect(plugin.isDragging, 'resize drag:cancel resets plugin.isDragging').toBe(false);
            expect(resizable.isDragging, 'resize drag:cancel resets resizable.isDragging').toBe(false);
            expect(component.eventDragZone.keepStartDate).toBe(false);

            // 3. Column drag-to-create cancelled via `drag:cancel` removes the provisional 'New Event' and resets state
            const colPath = [
                {id: targetCol.id, cls: ['neo-c-w-column'], rect: {height: 600, left: 140, top: 0, width: 120}},
                {id: component.id, cls: ['neo-calendar-weekcomponent']}
            ];

            await plugin.onColumnDragStart({clientX: 160, clientY: 300, path: colPath, targetPath: colPath});
            expect(plugin.isDragging).toBe(true);
            expect(eventStore.getCount(), 'provisional New Event added during column drag').toBe(2);

            DomEvent.fire({
                data     : {dragZoneId: component.eventDragZone.id, path: colPath, targetPath: colPath},
                eventName: 'drag:cancel',
                windowId : component.windowId
            });

            expect(plugin.isDragging, 'column drag:cancel resets plugin.isDragging').toBe(false);
            expect(resizable.isDragging, 'column drag:cancel resets resizable.isDragging').toBe(false);
            expect(eventStore.getCount(), 'column drag:cancel removes provisional New Event').toBe(1);

            component.destroy();
            calendarStore.destroy();
            eventStore.destroy()
        } finally {
            Neo.applyDeltas                          = originalDeltas;
            Neo.main.addon.DragDrop                  = originalDragDrop;
            Neo.main.DomAccess.getBoundingClientRect = originalGetRect
        }
    });
});
