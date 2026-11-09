import {setup} from '../../setup.mjs';

const appName = 'DateSelectorMonthYearTest';

setup({appConfig: {name: appName}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import DateSelector   from '../../../../src/component/DateSelector.mjs';

/**
 * @summary DateSelector's header label opens a month and year selector. A picked pair moves the value the way the
 * previous / next month buttons do, and while the selector is open, neither the wheel nor an Enter on the label
 * reaches the day view.
 */

/**
 * @param {Object} config
 * @returns {Neo.component.DateSelector}
 */
function createDateSelector(config) {
    const dateSelector = Neo.create(DateSelector, {appName, ...config});

    dateSelector.promiseUpdate = () => Promise.resolve();

    return dateSelector
}

test.describe('Neo.component.DateSelector month and year selector', () => {
    test('the header label is a collapsed toggle button, and a plain label with useMonthYearSelector false', () => {
        const dateSelector = createDateSelector({value: '2026-01-31'});

        expect(dateSelector.getHeaderCenterEl()).toMatchObject({'aria-expanded': false, role: 'button', tabIndex: 0});

        dateSelector.useMonthYearSelector = false;

        const label = dateSelector.getHeaderCenterEl();

        expect([label['aria-expanded'], label.role, label.tabIndex]).toEqual([undefined, undefined, undefined]);
        expect(label.id, 'the day grid keeps its aria-labelledby target').toBe(dateSelector.getHeaderCenterId());

        dateSelector.destroy()
    });

    test('a picked month and year move the value to the same day, clamped to the month length and to minValue / maxValue', async () => {
        const dateSelector = createDateSelector({maxValue: '2026-09-10', minValue: '2025-03-20', value: '2026-01-31'});

        await dateSelector.onMonthYearSelect({month: 1, year: 2026});
        expect(dateSelector.value, 'January 31 has no February twin').toBe('2026-02-28');

        dateSelector.value = '2026-04-05';
        await dateSelector.onMonthYearSelect({month: 2, year: 2025});
        expect(dateSelector.value).toBe('2025-03-20');

        dateSelector.value = '2026-04-20';
        await dateSelector.onMonthYearSelect({month: 8, year: 2026});
        expect(dateSelector.value).toBe('2026-09-10');

        dateSelector.destroy()
    });

    test('the wheel leaves the day view alone while the month and year selector is open', () => {
        const dateSelector = createDateSelector({value: '2026-01-15'});

        // A stand-in for the open selector: only its hidden state matters here
        dateSelector.monthYearSelector = {hidden: false};
        dateSelector.onComponentWheel({deltaX: 0, deltaY: 5});
        expect(dateSelector.value).toBe('2026-01-15');

        dateSelector.monthYearSelector = null;
        dateSelector.onComponentWheel({deltaX: 0, deltaY: 5});
        expect(dateSelector.value).toBe('2027-01-15');

        dateSelector.destroy()
    });

    test('Enter on the header label never commits the keyboard destination', () => {
        const dateSelector = createDateSelector({selectionModel: {selectOnNavigate: false}, value: '2026-01-15'}),
              model        = dateSelector.selectionModel,
              labelId      = dateSelector.getHeaderCenterId();

        model.navigationId = `${dateSelector.id}__2026-01-20`;

        model.onKeyDownEnter({path: [
            {cls: ['neo-center-region'], id: labelId},
            {cls: ['neo-dateselector-header']},
            {cls: ['neo-dateselector'], id: dateSelector.id}
        ]});

        expect(dateSelector.value).toBe('2026-01-15');

        dateSelector.destroy()
    })
});
