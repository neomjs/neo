import {setup} from '../../setup.mjs';

const appName = 'DateSelectorContainerBindingTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import DayViewComponent   from '../../../../src/date/DayViewComponent.mjs';
import SelectorContainer  from '../../../../src/date/SelectorContainer.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import * as layouts       from '../../../../src/layout/_export.mjs';

/**
 * @summary A date selector renders its day view after its state bindings arrive.
 */
test.describe('Neo.date.SelectorContainer bound day formatter', () => {
    test('constructs the selector and renders its bound weekday headings', () => {
        let selector;

        try {
            selector = Neo.create(SelectorContainer, {
                appName,
                locale       : 'en-US',
                useAnimations: false,
                value        : '2026-10-21'
            });

            expect(selector.dayView.vdom.cn[0].cn.map(node => node.cn[0].text))
                .toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
            expect(selector.dayView.vdom.cn.length).toBeGreaterThan(1);

            selector.dayNameFormat = 'long';
            selector.weekStartDay  = 1;

            expect(selector.dayView.vdom.cn[0].cn.map(node => node.cn[0].text))
                .toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
        } finally {
            selector?.destroy()
        }
    });

    test('renders when the weekday formatter arrives after the date', () => {
        const view = Neo.create(DayViewComponent, {
            appName,
            currentDate  : new Date(2026, 9, 21, 12),
            stateProvider: {
                data: {
                    intlFormatDay: null,
                    weekStartDay : 1
                }
            }
        });

        try {
            expect(view.vdom.cn).toEqual([]);

            view.setState('intlFormatDay', new Intl.DateTimeFormat('en-US', {weekday: 'short'}));

            expect(view.vdom.cn[0].cn.map(node => node.cn[0].text))
                .toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
        } finally {
            view.destroy()
        }
    });

    test('renders when the date arrives after the weekday formatter', () => {
        const view = Neo.create(DayViewComponent, {
            appName,
            stateProvider: {
                data: {
                    intlFormatDay: new Intl.DateTimeFormat('en-US', {weekday: 'short'}),
                    weekStartDay : 0
                }
            }
        });

        try {
            expect(view.vdom.cn).toEqual([]);

            view.currentDate = new Date(2026, 9, 21, 12);

            expect(view.vdom.cn[0].cn.map(node => node.cn[0].text))
                .toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
        } finally {
            view.destroy()
        }
    });
});
