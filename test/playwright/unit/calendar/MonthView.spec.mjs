import {setup} from '../../setup.mjs';

const appName = 'CalendarMonthViewTest';

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

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import CalendarsStore     from '../../../../src/calendar/store/Calendars.mjs';
import EventsStore        from '../../../../src/calendar/store/Events.mjs';
import MonthComponent     from '../../../../src/calendar/view/month/Component.mjs';
import MonthDragDrop      from '../../../../src/calendar/view/month/plugin/DragDrop.mjs';
import MonthEventDragZone from '../../../../src/calendar/view/month/EventDragZone.mjs';
import MainContainer      from '../../../../src/calendar/view/MainContainer.mjs';
import VDomUtil           from '../../../../src/util/VDom.mjs';

/**
 * @summary Unit tests for Neo.calendar.view.month.Component#updateHeaderHeight and MainContainer#afterSetBaseFontSize
 */
test.describe('Neo.calendar.view.month.Component headerHeight lifecycle', () => {
    let originalGetBoundingClientRect,
        originalScrollTo;

    test.beforeEach(() => {
        originalGetBoundingClientRect = Neo.main.DomAccess.getBoundingClientRect;
        originalScrollTo              = Neo.main.DomAccess.scrollTo;
    });

    test.afterEach(() => {
        Neo.main.DomAccess.getBoundingClientRect = originalGetBoundingClientRect;
        Neo.main.DomAccess.scrollTo              = originalScrollTo;
    });

    test('updateHeaderHeight measures header height in px and scrolls only when scrollTo is true', async () => {
        let measuredHeaderHeight  = 45,
            scrollContainerHeight = 645,
            scrollCalls           = [];

        Neo.main.DomAccess.getBoundingClientRect = async ({id}) => {
            return id.map((nodeId, index) => ({
                width : 800,
                height: index === 0 ? scrollContainerHeight : measuredHeaderHeight,
                x     : 0,
                y     : 0
            }));
        };

        Neo.main.DomAccess.scrollTo = async (data) => {
            scrollCalls.push(data);
        };

        const component = Neo.create(MonthComponent, {
            appName,
            calendarStore: Neo.create(CalendarsStore),
            currentDate  : new Date(2026, 3, 15),
            eventStore   : Neo.create(EventsStore)
        });

        component.timeout = () => Promise.resolve();

        let lastHeaderPromise;
        const origUpdateHeaderHeight = component.updateHeaderHeight.bind(component);
        component.updateHeaderHeight = (scrollTo) => {
            lastHeaderPromise = origUpdateHeaderHeight(scrollTo);
            return lastHeaderPromise;
        };

        await component.initVnode();
        component.mounted = true;

        await lastHeaderPromise;

        expect(component.headerHeight).toBe(45);
        expect(scrollCalls.length).toBe(1);
        expect(scrollCalls[0]).toEqual({
            direction: 'top',
            id       : component.vdom.cn[1].id,
            value    : 600,
            windowId : component.windowId
        });

        // Simulate a baseFontSize change calling updateHeaderHeight(false)
        measuredHeaderHeight = 60;
        await component.updateHeaderHeight();

        expect(component.headerHeight).toBe(60);
        expect(scrollCalls.length).toBe(1);

        // Simulate currentDate change while mounted -> scrollTo=true
        measuredHeaderHeight = 54;
        component.currentDate = new Date(2026, 4, 15);
        await lastHeaderPromise;

        expect(component.headerHeight).toBe(54);
        expect(scrollCalls.length).toBe(2);
        expect(scrollCalls[1].value).toBe(645 - 54);

        component.destroy();
    });

    test('MainContainer#afterSetBaseFontSize updates style.fontSize and refreshes mounted monthComponent.headerHeight', async () => {
        let updateHeaderHeightCalls = [];

        const mockMonthComponent = {
            mounted           : true,
            updateHeaderHeight: (scrollTo = false) => {
                updateHeaderHeightCalls.push(scrollTo);
            }
        };

        const harness = {
            monthComponent: mockMonthComponent,
            style         : {}
        };

        MainContainer.prototype.afterSetBaseFontSize.call(harness, '16', '14');

        expect(harness.style).toEqual({fontSize: '16px'});
        expect(updateHeaderHeightCalls).toEqual([false]);

        // Unmounted monthComponent should not trigger updateHeaderHeight
        mockMonthComponent.mounted = false;
        MainContainer.prototype.afterSetBaseFontSize.call(harness, '18', '16');

        expect(harness.style).toEqual({fontSize: '18px'});
        expect(updateHeaderHeightCalls).toEqual([false]);
    });

    test('onWheel downward and upward boundary crossings shift 6 weeks and compensate scrollTop via scrollTo', async () => {
        let measuredHeaderHeight  = 45,
            scrollContainerHeight = 645,
            removedBlockHeight    = 624,
            scrollCalls           = [];

        Neo.main.DomAccess.getBoundingClientRect = async ({id}) => {
            if (Array.isArray(id) && id.every(nodeId => String(nodeId).includes('__week__'))) {
                return [
                    {width: 800, height: 100, top: 100, x: 0, y: 100},
                    {width: 800, height: 100, top: 100 + removedBlockHeight, x: 0, y: 100 + removedBlockHeight}
                ];
            }

            return id.map((nodeId, index) => ({
                width : 800,
                height: index === 0 ? scrollContainerHeight : measuredHeaderHeight,
                x     : 0,
                y     : 0
            }));
        };

        Neo.main.DomAccess.scrollTo = async (data) => {
            scrollCalls.push(data);
        };

        const component = Neo.create(MonthComponent, {
            appName,
            calendarStore: Neo.create(CalendarsStore),
            currentDate  : new Date(2027, 1, 1),
            eventStore   : Neo.create(EventsStore),
            weekStartDay : 0
        });

        component.timeout = () => Promise.resolve();

        let lastHeaderPromise;
        const origUpdateHeaderHeight = component.updateHeaderHeight.bind(component);
        component.updateHeaderHeight = (scrollTo) => {
            lastHeaderPromise = origUpdateHeaderHeight(scrollTo);
            return lastHeaderPromise;
        };

        await component.initVnode();
        component.mounted = true;
        await lastHeaderPromise;

        const getWeekFlags = () => component.vdom.cn[1].cn
            .filter(node => node.cls.includes('neo-week'))
            .map(node => node.flag);

        const initialWeeks = getWeekFlags();
        expect(initialWeeks.length).toBe(18);
        expect(scrollCalls.length).toBe(1);

        let lastPromiseUpdate;
        const origPromiseUpdate = component.promiseUpdate.bind(component);
        component.promiseUpdate = (...args) => {
            lastPromiseUpdate = origPromiseUpdate(...args);
            return lastPromiseUpdate;
        };

        component.onWheel({
            clientHeight: 645,
            deltaX      : 0,
            deltaY      : 40,
            scrollTop   : 1180
        });

        await lastPromiseUpdate;
        await Promise.resolve();

        const afterDownWeeks = getWeekFlags();
        expect(afterDownWeeks.length).toBe(18);
        expect(afterDownWeeks.slice(0, 12)).toEqual(initialWeeks.slice(6, 18));
        expect(scrollCalls.length).toBe(2);
        expect(scrollCalls[1]).toEqual({
            direction: 'top',
            id       : component.vdom.cn[1].id,
            value    : 1180 - removedBlockHeight,
            windowId : component.windowId
        });

        component.onWheel({
            clientHeight: 645,
            deltaX      : 0,
            deltaY      : -40,
            scrollTop   : 20
        });

        await lastPromiseUpdate;

        const afterUpWeeks = getWeekFlags();
        expect(afterUpWeeks.length).toBe(18);
        expect(afterUpWeeks).toEqual(initialWeeks);
        expect(scrollCalls.length).toBe(3);
        expect(scrollCalls[2]).toEqual({
            direction: 'top',
            id       : component.vdom.cn[1].id,
            value    : 600,
            windowId : component.windowId
        });

        clearTimeout(component.scrollTaskId);
        component.destroy();
    });

    test('onWheelEnd updates header date from closest visible week row and smoothly snaps scroll position', async () => {
        let scrollCalls = [],
            rowTops     = null;

        Neo.main.DomAccess.getBoundingClientRect = async ({id}) => {
            if (Array.isArray(id) && id.length === 2) {
                return [
                    {width: 800, height: 645, x: 0, y: 0, top: 0},
                    {width: 800, height: 45,  x: 0, y: 0, top: 0}
                ];
            }

            if (Array.isArray(id) && rowTops) {
                return [
                    {width: 800, height: 645, x: 0, y: 0, top: 0},
                    ...rowTops.map(top => ({width: 800, height: 100, x: 0, y: top, top}))
                ];
            }

            return id.map(() => ({width: 800, height: 100, x: 0, y: 0}));
        };

        Neo.main.DomAccess.scrollTo = async (data) => {
            scrollCalls.push(data);
        };

        const component = Neo.create(MonthComponent, {
            appName,
            calendarStore: Neo.create(CalendarsStore),
            currentDate  : new Date(2026, 4, 15), // May 2026
            eventStore   : Neo.create(EventsStore),
            locale       : 'en-US'
        });

        component.timeout = () => Promise.resolve();
        await component.initVnode();
        component.mounted = true;
        await component.updateHeaderHeight(true);

        scrollCalls = [];

        // 1. Live DOM rect measurement path (with variable-height tall week at index 2 = 130px):
        // Simulate scroll settled near week 6 (May 2026 start week, cumulative offset 630px, currently at top = 53px vs visibleTop = 45px)
        const heights = Array.from({length: 18}, (_, i) => i === 2 ? 130 : 100);
        const offsets = [];
        let   acc     = 0;
        for (const h of heights) {
            offsets.push(acc);
            acc += h;
        }
        const currentScrollTop = 622; // 8px before week 6's offset (630px)
        rowTops = offsets.map(off => 45 + off - currentScrollTop);

        component.isScrolling = true;
        component.vdom.cn[1].cls.push('neo-is-scrolling');
        component.vdom.cn[0].cn[0].style.opacity = 0;

        await component.onWheelEnd();

        expect(component.isScrolling).toBe(false);
        expect(component.vdom.cn[1].cls).not.toContain('neo-is-scrolling');
        expect(component.vdom.cn[0].cn[0].style.opacity).toBe(1);
        expect(component.vdom.cn[0].cn[0].cn[0].text).toBe('May');
        expect(component.vdom.cn[0].cn[0].cn[1].text).toBe(' 2026');
        expect(scrollCalls.length).toBe(1);
        expect(scrollCalls[0]).toEqual({
            behavior : 'smooth',
            direction: 'top',
            id       : component.vdom.cn[1].id,
            value    : 630,
            windowId : component.windowId
        });

        // 2. Fallback wheelData path: scrolled up into April 2026 (closest row index 3 -> scrollTop 320px with rowHeight 100px)
        rowTops     = null;
        scrollCalls = [];

        await component.onWheelEnd({clientHeight: 645, scrollTop: 320});

        expect(component.vdom.cn[0].cn[0].cn[0].text).toBe('Apr');
        expect(component.vdom.cn[0].cn[0].cn[1].text).toBe(' 2026');
        expect(scrollCalls.length).toBe(1);
        expect(scrollCalls[0]).toEqual({
            behavior : 'smooth',
            direction: 'top',
            id       : component.vdom.cn[1].id,
            value    : 300,
            windowId : component.windowId
        });

        // 3. Fallback wheelData path: scrolled down into June 2026 (closest row index 11 -> scrollTop 1080px with rowHeight 100px)
        scrollCalls = [];

        await component.onWheelEnd({clientHeight: 645, scrollTop: 1080});

        expect(component.vdom.cn[0].cn[0].cn[0].text).toBe('Jun');
        expect(component.vdom.cn[0].cn[0].cn[1].text).toBe(' 2026');
        expect(scrollCalls.length).toBe(1);
        expect(scrollCalls[0]).toEqual({
            behavior : 'smooth',
            direction: 'top',
            id       : component.vdom.cn[1].id,
            value    : 1100,
            windowId : component.windowId
        });

        component.destroy();
    });

    test('EventDragZone and DragDrop plugin move events into different days while preserving local start time and duration (#2334)', async () => {
        const appliedDeltas       = [],
              originalApplyDeltas = Neo.applyDeltas,
              originalDragDrop    = Neo.main.addon.DragDrop;

        Neo.applyDeltas = async (windowId, deltas) => {
            appliedDeltas.push(deltas);
        };

        Neo.main.addon.DragDrop = {
            registerZone       : async () => {},
            setConfigs         : async () => ({boundaryContainerRect: {height: 600, left: 0, top: 0, width: 800}}),
            setDragProxyElement: async () => {},
            unregisterZone     : async () => {}
        };

        Neo.main.DomAccess.getBoundingClientRect = async ({id}) => {
            return id.map(() => ({width: 120, height: 22, left: 10, top: 20, x: 10, y: 20}));
        };

        Neo.main.DomAccess.scrollTo = async () => {};

        try {
            const calendarStore = Neo.create(CalendarsStore, {
                data: [{
                    active: true,
                    color : 'blue',
                    id    : 1,
                    name  : 'Work'
                }]
            });

            const eventStore = Neo.create(EventsStore, {
                data: [{
                    calendarId: 1,
                    endDate   : new Date(2026, 4, 12, 11, 0, 0),
                    id        : 101,
                    startDate : new Date(2026, 4, 12, 9, 30, 0),
                    title     : 'Design Review'
                }, {
                    calendarId: 1,
                    endDate   : new Date(2026, 4, 14, 15, 0, 0),
                    id        : 102,
                    startDate : new Date(2026, 4, 14, 14, 0, 0),
                    title     : 'Sprint Sync'
                }]
            });

            const component = Neo.create(MonthComponent, {
                appName,
                calendarStore,
                currentDate: new Date(2026, 4, 15),
                enableDrag : true,
                eventStore,
                plugins    : [{module: MonthDragDrop, appName}]
            });

            component.timeout = () => Promise.resolve();
            await component.initVnode();
            component.mounted = true;

            const plugin        = component.getPlugin('calendar-month-dragdrop'),
                  sourceDayId   = `${component.id}__day__2026-05-12`,
                  targetDayId   = `${component.id}__day__2026-05-15`,
                  eventNodeId   = `${component.id}__101`,
                  sourceDayVdom = VDomUtil.find(component.vdom, sourceDayId).vdom,
                  targetDayVdom = VDomUtil.find(component.vdom, targetDayId).vdom,
                  eventVdom     = VDomUtil.find(component.vdom, eventNodeId).vdom;

            expect(plugin).toBeInstanceOf(MonthDragDrop);
            expect(component.getScrollContainer().flag).toBe('neo-c-m-scrollcontainer');
            expect(eventVdom.cls).toContain('neo-draggable');
            expect(sourceDayVdom.flag).toBe('2026-05-12');
            expect(targetDayVdom.flag).toBe('2026-05-15');
            expect(sourceDayVdom.cn.some(node => node.id === eventNodeId)).toBe(true);
            expect(targetDayVdom.cn.some(node => node.id === eventNodeId)).toBe(false);

            const dragStartData = {
                clientX: 25,
                clientY: 30,
                path   : [
                    {id: eventNodeId, cls: ['neo-event', 'neo-draggable', 'neo-blue'], rect: {width: 120, height: 22, left: 10, top: 20, x: 10, y: 20}},
                    {id: sourceDayId, cls: ['neo-day'],                                rect: {width: 120, height: 100, left: 10, top: 0, x: 10, y: 0}}
                ],
                targetPath: [
                    {id: eventNodeId, cls: ['neo-event', 'neo-draggable', 'neo-blue']},
                    {id: sourceDayId, cls: ['neo-day']}
                ]
            };

            await plugin.onEventDragStart(dragStartData);

            const {eventDragZone} = component;
            expect(eventDragZone).toBeInstanceOf(MonthEventDragZone);
            expect(plugin.isDragging).toBe(true);
            expect(eventDragZone.dragProxy).toBeTruthy();
            expect(eventDragZone.proxyParentId).toBe(sourceDayId);
            expect(eventDragZone.eventDuration).toBe(90);

            // Move pointer over 2026-05-15 day cell
            plugin.onEventDragMove({
                clientX   : 380,
                clientY   : 30,
                targetPath: [
                    {id: `${component.id}__day_number__2026-05-15`, cls: ['neo-day-number']},
                    {id: targetDayId,                               cls: ['neo-day']}
                ]
            });

            expect(eventDragZone.proxyParentId).toBe(targetDayId);
            expect(appliedDeltas.some(delta =>
                !Array.isArray(delta) &&
                delta.action === 'moveNode' &&
                delta.parentId === targetDayId &&
                delta.index === 1
            )).toBe(true);

            // End drag -> commits new date (2026-05-15) while preserving 09:30 -> 11:00 local time and resorts store
            const recordChanges = [];
            eventStore.on('recordChange', data => recordChanges.push(data));

            plugin.onEventDragEnd({});

            // The commit fires recordChange with the dragged fields, for subscribers and state bindings alike
            expect(recordChanges).toHaveLength(1);
            expect(recordChanges[0].fields.map(field => field.name)).toEqual(['endDate', 'startDate']);
            expect(recordChanges[0].record).toBe(eventStore.get(101));

            const movedRecord = eventStore.get(101);
            expect(plugin.isDragging).toBe(false);
            expect(movedRecord.startDate.getFullYear()).toBe(2026);
            expect(movedRecord.startDate.getMonth()).toBe(4);
            expect(movedRecord.startDate.getDate()).toBe(15);
            expect(movedRecord.startDate.getHours()).toBe(9);
            expect(movedRecord.startDate.getMinutes()).toBe(30);

            expect(movedRecord.endDate.getFullYear()).toBe(2026);
            expect(movedRecord.endDate.getMonth()).toBe(4);
            expect(movedRecord.endDate.getDate()).toBe(15);
            expect(movedRecord.endDate.getHours()).toBe(11);
            expect(movedRecord.endDate.getMinutes()).toBe(0);

            // Store was resorted: 102 (May 14) now precedes 101 (May 15)
            expect(eventStore.getAt(0).id).toBe(102);
            expect(eventStore.getAt(1).id).toBe(101);

            // Month VDOM was refreshed with event 101 under 2026-05-15 instead of 2026-05-12
            const refreshedSourceDay = VDomUtil.find(component.vdom, sourceDayId).vdom,
                  refreshedTargetDay = VDomUtil.find(component.vdom, targetDayId).vdom;

            expect(refreshedSourceDay.cn.some(node => node.id === eventNodeId)).toBe(false);
            expect(refreshedTargetDay.cn.some(node => node.id === eventNodeId)).toBe(true);

            // Dropping back onto the starting day changes no field and fires no recordChange,
            // yet the view still restores itself after the proxy teardown
            recordChanges.length = 0;

            const createContentCalls = {count: 0},
                  origCreateContent  = component.createContent.bind(component);

            component.createContent = (...args) => {createContentCalls.count++; return origCreateContent(...args)};

            await plugin.onEventDragStart({
                clientX: 25,
                clientY: 30,
                path   : [
                    {id: eventNodeId, cls: ['neo-event', 'neo-draggable', 'neo-blue'], rect: {width: 120, height: 22, left: 10, top: 20, x: 10, y: 20}},
                    {id: targetDayId, cls: ['neo-day'],                                rect: {width: 120, height: 100, left: 10, top: 0, x: 10, y: 0}}
                ],
                targetPath: [
                    {id: eventNodeId, cls: ['neo-event', 'neo-draggable', 'neo-blue']},
                    {id: targetDayId, cls: ['neo-day']}
                ]
            });
            plugin.onEventDragEnd({});

            expect(recordChanges).toEqual([]);
            expect(createContentCalls.count).toBe(1);

            // When enableDrag is false, drag handlers do not start a drag or mutate records
            component.enableDrag = false;
            plugin.onEventDragStart(dragStartData);
            expect(plugin.isDragging).toBe(false);

            // Destroying the component/plugin destroys the EventDragZone and clears owner.eventDragZone
            component.destroy();
            expect(eventDragZone.isDestroyed).toBe(true);
            expect(component.eventDragZone).toBeNull();
            calendarStore.destroy();
            eventStore.destroy();
        } finally {
            Neo.applyDeltas         = originalApplyDeltas;
            Neo.main.addon.DragDrop = originalDragDrop;
        }
    });
});
