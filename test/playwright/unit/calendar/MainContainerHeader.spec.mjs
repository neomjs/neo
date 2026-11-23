import {setup} from '../../setup.mjs';

const appName = 'CalendarHeaderPeriodTestApp';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DateUtil       from '../../../../src/util/Date.mjs';
import MainContainer  from '../../../../src/calendar/view/MainContainer.mjs';

/**
 * @summary Reads the full and short period text nodes from a MainContainer's header period component.
 * @param {Neo.calendar.view.MainContainer} calendar
 * @returns {{full: String|undefined, hidden: Boolean, removeDom: Boolean, short: String|undefined}}
 */
function readPeriod(calendar) {
    const cmp               = calendar.headerPeriodComponent,
          [fullNode, short] = cmp.vdom.cn;

    return {
        full     : fullNode.text,
        hidden   : cmp.hidden,
        removeDom: Boolean(cmp.vdom.removeDom),
        short    : short.text
    }
}

test.describe('Neo.calendar.view.MainContainer header period', () => {
    let calendar;

    test.afterEach(async () => {
        await new Promise(resolve => setTimeout(resolve, 25));
        calendar?.destroy();
        calendar = null
    });

    test('formats Day, Week, Month and hides in Year view', async () => {
        calendar = Neo.create({
            module              : MainContainer,
            activeView          : 'day',
            appName,
            calendarStoreConfig : {data: []},
            eventStoreConfig    : {data: []},
            useSettingsContainer: false
        });

        calendar.stateProvider.setData({
            currentDate : new Date(2026, 6, 22),
            locale      : 'en-US',
            showWeekends: true,
            weekStartDay: 0
        });

        expect(readPeriod(calendar)).toEqual({
            full     : 'Wednesday, July 22, 2026',
            hidden   : false,
            removeDom: false,
            short    : 'Jul 22, 2026'
        });

        calendar.activeView = 'week';
        expect(readPeriod(calendar)).toEqual({
            full     : 'Jul 19\u2009–\u200925, 2026',
            hidden   : false,
            removeDom: false,
            short    : 'Jul 19\u2009–\u200925, 2026'
        });

        calendar.stateProvider.setData({currentDate: new Date(2026, 6, 1)});
        expect(readPeriod(calendar).full).toBe('Jun 28\u2009–\u2009Jul 4, 2026');

        calendar.stateProvider.setData({currentDate: new Date(2026, 11, 31)});
        expect(readPeriod(calendar).full).toBe('Dec 27, 2026\u2009–\u2009Jan 2, 2027');

        calendar.stateProvider.setData({
            currentDate : new Date(2026, 6, 22),
            showWeekends: false
        });
        expect(readPeriod(calendar).full).toBe('Jul 20\u2009–\u200924, 2026');

        calendar.activeView = 'month';
        expect(readPeriod(calendar)).toEqual({
            full     : 'July 2026',
            hidden   : false,
            removeDom: false,
            short    : 'Jul 2026'
        });

        calendar.activeView = 'year';
        expect(readPeriod(calendar).hidden).toBe(true);
        expect(readPeriod(calendar).removeDom).toBe(true)
    });

    test('follows interval navigation, Today, year-to-day selection and locale changes', async () => {
        calendar = Neo.create({
            module              : MainContainer,
            activeView          : 'year',
            appName,
            calendarStoreConfig : {data: []},
            eventStoreConfig    : {data: []},
            useSettingsContainer: false
        });

        calendar.stateProvider.setData({
            currentDate: new Date(2026, 6, 22),
            locale     : 'en-US'
        });

        expect(readPeriod(calendar).hidden).toBe(true);
        expect(readPeriod(calendar).removeDom).toBe(true);

        calendar.activeView = 'day';
        expect(readPeriod(calendar).full).toBe('Wednesday, July 22, 2026');
        expect(readPeriod(calendar).removeDom).toBe(false);

        calendar.onNextIntervalButtonClick();
        expect(readPeriod(calendar).full).toBe('Thursday, July 23, 2026');

        calendar.onPreviousIntervalButtonClick();
        expect(readPeriod(calendar).full).toBe('Wednesday, July 22, 2026');

        calendar.stateProvider.setData({locale: 'de-DE'});
        const expectedGerman = DateUtil.formatWall(
            'de-DE',
            {weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'},
            new Date(Date.UTC(2026, 6, 22))
        );
        expect(readPeriod(calendar).full).toBe(expectedGerman);

        calendar.onTodayButtonClick();
        const todayAfterClick = DateUtil.clone(calendar.data.currentDate);

        calendar.onNextIntervalButtonClick();
        calendar.onTodayButtonClick();
        expect(DateUtil.matchDate(calendar.data.currentDate, todayAfterClick)).toBe(true)
    })
});
