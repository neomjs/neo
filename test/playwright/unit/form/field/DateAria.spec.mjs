import {setup} from '../../../setup.mjs';

const appName = 'DateFieldAriaTest';

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
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import DateField          from '../../../../../src/form/field/Date.mjs';
import DateSelector       from '../../../../../src/component/DateSelector.mjs';
import DateUtil           from '../../../../../src/util/Date.mjs';
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../../src/vdom/Helper.mjs';

test.describe('Neo.form.field.Date and Neo.component.DateSelector WAI-ARIA semantics (#5219)', () => {
    test('DateField input, trigger, and floating picker expose WAI-ARIA dialog attributes and sync aria-expanded', () => {
        const field = Neo.create(DateField, {
            appName,
            id   : 'test-date-field-aria',
            value: '2026-05-15'
        });

        try {
            const inputEl   = field.getInputEl(),
                  trigger   = field.getTrigger('picker'),
                  picker    = field.getPicker(),
                  pickerDom = picker.vdom;

            expect(inputEl['aria-haspopup']).toBe('dialog');
            expect(inputEl['aria-expanded']).toBe(false);
            expect(inputEl['aria-controls']).toBe(field.getPickerId());

            expect(trigger.vdom.role).toBe('button');
            expect(trigger.vdom['aria-label']).toBe('Choose Date');
            expect(trigger.vdom['aria-haspopup']).toBe('dialog');

            expect(pickerDom.role).toBe('dialog');
            expect(pickerDom['aria-modal']).toBe(true);
            expect(pickerDom['aria-label']).toBe('Choose Date');

            field.onPickerHiddenChange({id: picker.id, oldValue: true, value: false});
            expect(inputEl['aria-expanded']).toBe(true);

            field.onPickerHiddenChange({id: picker.id, oldValue: false, value: true});
            expect(inputEl['aria-expanded']).toBe(false);
        } finally {
            field.destroy();
        }
    });

    test('DateSelector renders WAI-ARIA grid, columnheader abbr, gridcell states, and updates selection & weekday headers', async () => {
        const todayStr = DateUtil.convertToyyyymmdd(new Date()),
              selector = Neo.create(DateSelector, {
                  appName,
                  id           : 'test-date-selector-aria',
                  locale       : 'en-US',
                  maxValue     : '2026-05-20',
                  minValue     : '2026-05-10',
                  useAnimations: false,
                  value        : '2026-05-15'
              });

        try {
            await selector.initVnode();
            selector.mounted = true;

            const headerEl      = selector.vdom.cn[0],
                  prevBtn       = headerEl.cn[0],
                  centerRegion  = headerEl.cn[1],
                  nextBtn       = headerEl.cn[2],
                  gridEl        = selector.getCenterContentEl(),
                  headerRow     = gridEl.cn[0],
                  selectedCell  = selector.getVdomChild(`${selector.id}__2026-05-15`),
                  inRangeCell   = selector.getVdomChild(`${selector.id}__2026-05-16`),
                  beforeMinCell = selector.getVdomChild(`${selector.id}__2026-05-09`),
                  afterMaxCell  = selector.getVdomChild(`${selector.id}__2026-05-21`),
                  prevMonthCell = gridEl.cn[1].cn[0]; // April 26, 2026 (disabled overflow cell)

            expect(prevBtn.role).toBe('button');
            expect(prevBtn['aria-label']).toBe('Previous Month');
            expect(nextBtn.role).toBe('button');
            expect(nextBtn['aria-label']).toBe('Next Month');

            expect(centerRegion.id).toBe(`${selector.id}__header-center`);
            expect(centerRegion['aria-live']).toBe('polite');

            expect(gridEl.role).toBe('grid');
            expect(gridEl['aria-labelledby']).toBe(`${selector.id}__header-center`);

            expect(headerRow.role).toBe('row');
            expect(headerRow.cn.map(cell => cell.role)).toEqual(Array(7).fill('columnheader'));
            expect(headerRow.cn.map(cell => cell.abbr)).toEqual([
                'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
            ]);

            // Week rows and day gridcells
            for (let i = 1; i < gridEl.cn.length; i++) {
                expect(gridEl.cn[i].role).toBe('row');
                gridEl.cn[i].cn.forEach(cell => {
                    expect(cell.role).toBe('gridcell');
                    expect(typeof cell['aria-label']).toBe('string');
                    expect(cell['aria-label'].length).toBeGreaterThan(0);
                });
            }

            // Selected vs unselected in-range cell
            expect(selectedCell['aria-selected']).toBe(true);
            expect(selectedCell['aria-disabled']).toBeUndefined();
            expect(inRangeCell['aria-selected']).toBeUndefined();
            expect(inRangeCell['aria-disabled']).toBeUndefined();

            // Disabled cells (outside min/max range and adjacent-month overflow)
            expect(beforeMinCell['aria-disabled']).toBe(true);
            expect(afterMaxCell['aria-disabled']).toBe(true);
            expect(prevMonthCell['aria-disabled']).toBe(true);

            // Selection change updates aria-selected via SelectionModel
            selector.selectDate('2026-05-16');
            await selector.promiseUpdate();

            expect(selector.getVdomChild(`${selector.id}__2026-05-15`)['aria-selected']).toBeUndefined();
            expect(selector.getVdomChild(`${selector.id}__2026-05-16`)['aria-selected']).toBe(true);

            // Dynamic updateHeaderDays updates abbr when dayNameFormat changes
            selector.dayNameFormat = 'narrow';
            await selector.promiseUpdate();
            expect( selector.getCenterContentEl().cn[0].cn.map(cell => cell.abbr)).toEqual([
                'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
            ]);

            // Today's cell carries aria-current="date" when viewing the current month
            selector.minValue = null;
            selector.maxValue = null;
            selector.value    = todayStr;
            await selector.promiseUpdate();

            const todayCell = selector.getVdomChild(`${selector.id}__${todayStr}`);
            expect(todayCell['aria-current']).toBe('date');
            expect(todayCell['aria-selected']).toBe(true);
        } finally {
            selector.destroy();
        }
    });
});
