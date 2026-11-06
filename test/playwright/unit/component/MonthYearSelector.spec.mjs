import {setup} from '../../setup.mjs';

const appName = 'MonthYearSelectorTest';

setup({appConfig: {name: appName}});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import MonthYearSelector from '../../../../src/component/MonthYearSelector.mjs';

/**
 * @summary MonthYearSelector keeps a pending month and year in two listboxes, turns the years page at its edges,
 * disables what lies outside minValue / maxValue, and stops the keys it handles.
 *
 * The arms call the handlers with event stand-ins: `path` lists the target first, then its list.
 */

/**
 * @param {Object} [config={}]
 * @returns {Object} {events, focused, selector}
 */
function createSelector(config={}) {
    const events   = [],
          focused  = [],
          selector = Neo.create(MonthYearSelector, {appName, locale: 'en-US', month: 5, year: 2026, ...config});

    selector.focus         = id => focused.push(id);
    selector.promiseUpdate = () => Promise.resolve();

    selector.on({
        cancel: ()              => events.push('cancel'),
        select: ({month, year}) => events.push({month, year})
    });

    return {events, focused, selector}
}

/**
 * @param {Neo.component.MonthYearSelector} selector
 * @param {String} type  'month' or 'year'
 * @param {Number} value The month index or the year
 * @returns {Object[]} The event path of a key or a click on that option
 */
function optionPath(selector, type, value) {
    const list = type === 'month' ? selector.getMonthsEl() : selector.getYearsEl(),
          node = list.cn.find(option => option.id === selector.getOptionId(type, value));

    return [{cls: node.cls, id: node.id}, {cls: list.cls}, {cls: ['neo-monthyearselector'], id: selector.id}]
}

/**
 * @param {Neo.component.MonthYearSelector} selector
 * @param {String} cls
 * @returns {Object[]} The event path of a click on a button
 */
const buttonPath = (selector, cls) => [{cls: [cls]}, {cls: ['neo-monthyearselector'], id: selector.id}];

test.describe('Neo.component.MonthYearSelector', () => {
    test('lists twelve localized months and the decade of the pending year, the pending pair selected and tabbable', () => {
        const {selector} = createSelector(),
              months     = selector.getMonthsEl().cn,
              years      = selector.getYearsEl().cn;

        expect(months.map(option => option.text)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
        expect(months[5]).toMatchObject({'aria-label': 'June', 'aria-selected': true, role: 'option', tabIndex: 0});
        expect(months.filter(option => option.tabIndex === 0)).toHaveLength(1);

        expect(years.map(option => option.text)).toEqual(['2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028', '2029']);
        expect(years[6]).toMatchObject({'aria-selected': true, role: 'option', tabIndex: 0});
        expect(years.filter(option => option.tabIndex === 0)).toHaveLength(1);

        selector.destroy()
    });

    test('disables months and years outside minValue / maxValue, and a page button that only reaches disabled years', () => {
        const {selector} = createSelector({maxValue: '2031-08-20', minValue: '2024-03-15', year: 2024}),
              navEl      = selector.getYearsNavEl(),
              disabled   = list => list.cn.filter(option => option['aria-disabled']).map(option => option.text);

        expect(disabled(selector.getYearsEl())).toEqual(['2020', '2021', '2022', '2023']);
        expect(disabled(selector.getMonthsEl())).toEqual(['Jan', 'Feb']);
        expect(navEl.cn[0]).toMatchObject({'aria-disabled': true, tabIndex: -1});
        expect(navEl.cn[1]).toMatchObject({'aria-disabled': null, tabIndex: 0});

        selector.year = 2031;

        expect(disabled(selector.getYearsEl())).toEqual(['2032', '2033', '2034', '2035', '2036', '2037', '2038', '2039']);
        expect(disabled(selector.getMonthsEl())).toEqual(['Sep', 'Oct', 'Nov', 'Dec']);
        expect(navEl.cn[0]).toMatchObject({'aria-disabled': null, tabIndex: 0});
        expect(navEl.cn[1]).toMatchObject({'aria-disabled': true, tabIndex: -1});

        selector.destroy()
    });

    test('a year that excludes the pending month moves the month to the nearest one it allows', () => {
        const {selector} = createSelector({maxValue: '2027-04-30', minValue: '2024-03-15', month: 0, year: 2025});

        selector.year = 2024;
        expect(selector.month).toBe(2);

        selector.month = 11;
        selector.year  = 2027;
        expect(selector.month).toBe(3);

        selector.destroy()
    });

    test('arrow keys move the pending month inside its list, one per column and two per row, stopping at the ends and at disabled months', async () => {
        const {focused, selector} = createSelector({minValue: '2026-02-01', month: 1}),
              data                = {cancelBubble: false, path: optionPath(selector, 'month', 1)};

        selector.onKeyDownLeft(data);
        expect(selector.month, 'January is disabled').toBe(1);
        expect(data.cancelBubble).toBe(true);

        selector.onKeyDownDown({path: optionPath(selector, 'month', 1)});
        expect(selector.month).toBe(3);

        selector.onKeyDownRight({path: optionPath(selector, 'month', 3)});
        expect(selector.month).toBe(4);

        selector.onKeyDownUp({path: optionPath(selector, 'month', 4)});
        expect(selector.month).toBe(2);

        selector.month = 11;
        selector.onKeyDownRight({path: optionPath(selector, 'month', 11)});
        expect(selector.month).toBe(11);

        await expect.poll(() => focused.at(-1)).toBe(selector.getOptionId('month', 2));

        selector.destroy()
    });

    test('an arrow key past the end of the years page turns it, and the page buttons turn it without changing the year', async () => {
        const {focused, selector} = createSelector({year: 2029});

        selector.onKeyDownDown({path: optionPath(selector, 'year', 2029)});

        expect(selector.year).toBe(2031);
        expect(selector.getYearsEl().cn[0].text).toBe('2030');
        await expect.poll(() => focused.at(-1)).toBe(selector.getOptionId('year', 2031));

        selector.onClick({path: buttonPath(selector, 'neo-prev-years')});

        expect(selector.year).toBe(2031);
        expect(selector.getYearsEl().cn.map(option => option.text)[0]).toBe('2020');
        expect(selector.getYearsEl().cn.filter(option => option['aria-selected'])).toHaveLength(0);
        expect(selector.getYearsEl().cn[0].tabIndex, 'a page without the pending year hands the tabIndex to its first year').toBe(0);

        selector.onClick({path: buttonPath(selector, 'neo-next-years')});
        expect(selector.getYearsEl().cn[0].text).toBe('2030');

        selector.destroy()
    });

    test('a click picks an enabled option and skips a disabled one; OK selects the pending pair and Cancel cancels', () => {
        const {events, selector} = createSelector({minValue: '2026-03-01'});

        selector.onClick({path: optionPath(selector, 'month', 0)});
        expect(selector.month, 'January 2026 is disabled').toBe(5);

        selector.onClick({path: optionPath(selector, 'month', 8)});
        selector.onClick({path: optionPath(selector, 'year', 2027)});
        selector.onClick({path: buttonPath(selector, 'neo-ok-button')});
        selector.onClick({path: buttonPath(selector, 'neo-cancel-button')});

        expect(events).toEqual([{month: 8, year: 2027}, 'cancel']);

        selector.destroy()
    });

    test('Enter on an option selects it at once, Escape cancels, and both stop the key there', () => {
        const {events, selector} = createSelector(),
              enter              = {cancelBubble: false, path: optionPath(selector, 'year', 2028)},
              escape             = {cancelBubble: false, path: optionPath(selector, 'month', 5)};

        selector.onKeyDownEnter(enter);
        selector.onKeyDownEscape(escape);

        expect(events).toEqual([{month: 5, year: 2028}, 'cancel']);
        expect(enter.cancelBubble).toBe(true);
        expect(escape.cancelBubble).toBe(true);

        selector.destroy()
    })
});
