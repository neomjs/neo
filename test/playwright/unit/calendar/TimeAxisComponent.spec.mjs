import {setup} from '../../setup.mjs';

const appName = 'CalendarTimeAxisComponentTest';

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

import {test, expect}             from '@playwright/test';
import Neo                        from '../../../../src/Neo.mjs';
import * as core                  from '../../../../src/core/_export.mjs';
import InstanceManager            from '../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator         from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper                 from '../../../../src/vdom/Helper.mjs';
import CalendarsStore             from '../../../../src/calendar/store/Calendars.mjs';
import EventsStore                from '../../../../src/calendar/store/Events.mjs';
import MainContainerStateProvider from '../../../../src/calendar/view/MainContainerStateProvider.mjs';
import TimeAxisComponent          from '../../../../src/calendar/view/week/TimeAxisComponent.mjs';
import WeekComponent              from '../../../../src/calendar/view/week/Component.mjs';
import WeekSettingsContainer      from '../../../../src/calendar/view/settings/WeekContainer.mjs';

/**
 * @summary Unit tests for Neo.calendar.view.week.TimeAxisComponent 12h (am/pm) and 24h modes
 */
test.describe('Neo.calendar.view.week.TimeAxisComponent 12h (am/pm) and 24h mode (#941)', () => {
    test('defaults to 24h mode and switches between 12h, am/pm alias, custom options, and 24h', async () => {
        const timeAxis = Neo.create(TimeAxisComponent, {
            appName,
            locale: 'en-US'
        });

        await timeAxis.initVnode();
        timeAxis.mounted = true;

        const getLabels = () => timeAxis.vdom.cn.map(item => item.cn[0].text);

        expect(timeAxis.timeFormat).toBe('24h');
        expect(getLabels().length).toBe(25);
        expect(getLabels()[0]).toBe('00:00');
        expect(getLabels()[1]).toBe('01:00');
        expect(getLabels()[12]).toBe('12:00');
        expect(getLabels()[13]).toBe('13:00');
        expect(getLabels()[23]).toBe('23:00');
        expect(getLabels()[24]).toBe('00:00');

        timeAxis.timeFormat = 'am/pm';
        expect(timeAxis.timeFormat).toBe('12h');
        expect(getLabels()[0]).toBe('12 AM');
        expect(getLabels()[1]).toBe('1 AM');
        expect(getLabels()[12]).toBe('12 PM');
        expect(getLabels()[13]).toBe('1 PM');
        expect(getLabels()[23]).toBe('11 PM');
        expect(getLabels()[24]).toBe('12 AM');

        timeAxis.timeFormat = 'invalid-mode';
        expect(timeAxis.timeFormat).toBe('12h');

        timeAxis.timeFormat = {hour: '2-digit', minute: '2-digit', hour12: true};
        expect(getLabels()[0]).toBe('12:00 AM');
        expect(getLabels()[13]).toBe('01:00 PM');

        timeAxis.locale = 'es-ES';
        expect(getLabels()[13]).toBe(
            new Intl.DateTimeFormat('es-ES', {hour: '2-digit', minute: '2-digit', hour12: true})
                .format(new Date(2024, 0, 1, 13, 0, 0))
        );

        timeAxis.timeFormat = '24h';
        expect(getLabels()[0]).toBe('00:00');
        expect(getLabels()[13]).toBe('13:00');

        timeAxis.destroy();
    });

    test('default en-US provider and real WeekSettingsContainer radio controls agree from initialization and switch to 24h without toggle-away workaround', async () => {
        const originalScrollBy  = Neo.main.DomAccess.scrollBy;
        const originalDomEvents = Neo.main.DomEvents;

        Neo.main.DomAccess.scrollBy = async () => {};
        Neo.main.DomEvents = {
            ...originalDomEvents,
            registerDisabledInputChars  : Neo.emptyFn,
            unregisterDisabledInputChars: Neo.emptyFn
        };

        const weekComponent = Neo.create(WeekComponent, {
            appName,
            calendarStoreConfig: {
                data: [{id: 1, active: true, color: 'blue', name: 'Work'}]
            },
            currentDate     : new Date(2026, 3, 15),
            eventStoreConfig: {
                data: [{
                    id        : 101,
                    calendarId: 1,
                    endDate   : new Date(2026, 3, 15, 15, 0, 0),
                    startDate : new Date(2026, 3, 15, 13, 30, 0),
                    title     : 'Design Review'
                }]
            },
            showEventEndTime: true,
            stateProvider   : {
                module: MainContainerStateProvider,
                data  : {
                    currentDate: new Date(2026, 3, 15),
                    events     : {
                        border                          : 'left',
                        enableDrag                      : false,
                        enableEdit                      : true,
                        enableResizingAcrossOppositeEdge: true
                    },
                    locale    : 'en-US',
                    timeFormat: {hour: '2-digit', minute: '2-digit'}
                }
            }
        });

        weekComponent.timeout = () => Promise.resolve();
        weekComponent.getDomRect = async () => ({width: 700, height: 600});
        await weekComponent.initVnode();
        weekComponent.mounted = true;
        await Promise.resolve();
        await Promise.resolve();
        weekComponent.updateEvents();

        const weekSettings = Neo.create(WeekSettingsContainer, {
            appName,
            parentId: weekComponent.id
        });
        weekSettings.getWeekComponent = () => weekComponent;
        weekSettings.createContent();

        const [radio12h, radio24h] = weekSettings.items.filter(item => item.name === 'timeFormat');

        const getEventTimes = () => {
            const columns = weekComponent.getColumnContainer().cn;
            for (const col of columns) {
                if (col.cn?.length) {
                    return {
                        start: col.cn[0].cn[0].text,
                        end  : col.cn[0].cn[2].text
                    };
                }
            }
            return null;
        };

        expect(radio12h.checked).toBe(true);
        expect(radio24h.checked).toBe(false);
        expect(weekComponent.timeAxis.timeFormat).toBe('12h');
        expect(weekComponent.timeAxis.vdom.cn[13].cn[0].text).toBe('1 PM');
        expect(getEventTimes()).toEqual({start: '01:30 PM', end: '03:00 PM'});

        radio24h.checked = true;

        expect(radio12h.checked).toBe(false);
        expect(radio24h.checked).toBe(true);
        expect(weekComponent.timeAxis.timeFormat).toBe('24h');
        expect(weekComponent.timeAxis.vdom.cn[13].cn[0].text).toBe('13:00');
        expect(getEventTimes()).toEqual({start: '13:30', end: '15:00'});

        weekSettings.destroy();
        weekComponent.destroy();
        Neo.main.DomAccess.scrollBy = originalScrollBy;
        Neo.main.DomEvents          = originalDomEvents;
    });

    test('provider updates synchronize WeekSettingsContainer selection, TimeAxisComponent, and WeekComponent events, while explicit timeAxisConfig.timeFormat overrides default binding', async () => {
        const originalScrollBy  = Neo.main.DomAccess.scrollBy;
        const originalDomEvents = Neo.main.DomEvents;

        Neo.main.DomAccess.scrollBy = async () => {};
        Neo.main.DomEvents = {
            ...originalDomEvents,
            registerDisabledInputChars  : Neo.emptyFn,
            unregisterDisabledInputChars: Neo.emptyFn
        };

        const weekComponent = Neo.create(WeekComponent, {
            appName,
            calendarStoreConfig: {
                data: [{id: 1, active: true, color: 'blue', name: 'Work'}]
            },
            currentDate     : new Date(2026, 3, 15),
            eventStoreConfig: {
                data: [{
                    id        : 101,
                    calendarId: 1,
                    endDate   : new Date(2026, 3, 15, 15, 0, 0),
                    startDate : new Date(2026, 3, 15, 13, 30, 0),
                    title     : 'Design Review'
                }]
            },
            showEventEndTime: true,
            stateProvider   : {
                module: MainContainerStateProvider,
                data  : {
                    currentDate: new Date(2026, 3, 15),
                    events     : {
                        border                          : 'left',
                        enableDrag                      : false,
                        enableEdit                      : true,
                        enableResizingAcrossOppositeEdge: true
                    },
                    locale    : 'en-US',
                    timeFormat: {hour: '2-digit', minute: '2-digit'}
                }
            }
        });

        weekComponent.timeout = () => Promise.resolve();
        weekComponent.getDomRect = async () => ({width: 700, height: 600});
        await weekComponent.initVnode();
        weekComponent.mounted = true;
        await Promise.resolve();
        await Promise.resolve();
        weekComponent.updateEvents();

        const weekSettings = Neo.create(WeekSettingsContainer, {
            appName,
            parentId: weekComponent.id
        });
        weekSettings.getWeekComponent = () => weekComponent;
        weekSettings.createContent();

        const [radio12h, radio24h] = weekSettings.items.filter(item => item.name === 'timeFormat');

        const getEventTimes = () => {
            const columns = weekComponent.getColumnContainer().cn;
            for (const col of columns) {
                if (col.cn?.length) {
                    return {
                        start: col.cn[0].cn[0].text,
                        end  : col.cn[0].cn[2].text
                    };
                }
            }
            return null;
        };

        weekComponent.stateProvider.setData('locale', 'de-DE');

        expect(radio12h.checked).toBe(false);
        expect(radio24h.checked).toBe(true);
        expect(weekComponent.timeAxis.timeFormat).toBe('24h');
        expect(weekComponent.timeAxis.vdom.cn[13].cn[0].text).toBe('13:00');
        expect(getEventTimes()).toEqual({start: '13:30', end: '15:00'});

        weekComponent.stateProvider.setData('timeFormat', {hour: '2-digit', hour12: true, minute: '2-digit'});

        expect(radio12h.checked).toBe(true);
        expect(radio24h.checked).toBe(false);
        expect(weekComponent.timeAxis.timeFormat).toBe('12h');
        expect(weekComponent.timeAxis.vdom.cn[13].cn[0].text).toBe(
            new Intl.DateTimeFormat('de-DE', {hour: 'numeric', hour12: true}).format(new Date(2024, 0, 1, 13, 0, 0))
        );
        expect(getEventTimes()).toEqual({
            start: new Intl.DateTimeFormat('de-DE', {hour: '2-digit', hour12: true, minute: '2-digit'}).format(new Date(2026, 3, 15, 13, 30, 0)),
            end  : new Intl.DateTimeFormat('de-DE', {hour: '2-digit', hour12: true, minute: '2-digit'}).format(new Date(2026, 3, 15, 15, 0, 0))
        });

        const customAxis = Neo.create(TimeAxisComponent, {
            appName,
            parentId  : weekComponent.id,
            timeFormat: {hour: '2-digit', minute: '2-digit', hour12: false}
        });

        expect(customAxis.vdom.cn[13].cn[0].text).toBe('13:00');

        customAxis.destroy();
        weekSettings.destroy();
        weekComponent.destroy();
        Neo.main.DomAccess.scrollBy = originalScrollBy;
        Neo.main.DomEvents          = originalDomEvents;
    });
});
