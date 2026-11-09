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
            setSilent: () => {}
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
                  setSilent: () => {}
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
});
