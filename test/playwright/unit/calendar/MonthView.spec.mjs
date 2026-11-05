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
import MainContainer      from '../../../../src/calendar/view/MainContainer.mjs';

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
});
