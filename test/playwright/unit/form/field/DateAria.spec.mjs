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
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../../src/vdom/Helper.mjs';

test.describe('Neo.form.field.Date and Neo.component.DateSelector WAI-ARIA semantics', () => {
    test('DateField input, trigger, and floating picker expose non-modal WAI-ARIA dialog attributes, trigger keyboard activation, and sync aria-expanded', () => {
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

            expect(trigger.parentComponent).toBe(field);
            expect(trigger.vdom.role).toBe('button');
            expect(trigger.vdom.tabIndex).toBe(0);
            expect(trigger.vdom['aria-label']).toBe('Choose Date');
            expect(trigger.vdom['aria-haspopup']).toBe('dialog');

            expect(picker.focusOnMount).toBe(false);
            expect(pickerDom.role).toBe('dialog');
            expect(pickerDom['aria-modal']).toBeUndefined();
            expect(pickerDom['aria-label']).toBe('Choose Date');

            let triggerCalls = 0;
            trigger.onTriggerClick = () => { triggerCalls++; };

            const enterEvent = {cancelBubble: false};
            trigger.onTriggerKeyDown(enterEvent);
            expect(enterEvent.cancelBubble).toBe(true);
            expect(triggerCalls).toBe(1);

            const spaceEvent = {cancelBubble: false};
            trigger.onTriggerKeyDown(spaceEvent);
            expect(spaceEvent.cancelBubble).toBe(true);
            expect(triggerCalls).toBe(2);

            field.onPickerHiddenChange({id: picker.id, oldValue: true, value: false});
            expect(inputEl['aria-expanded']).toBe(true);

            field.onPickerHiddenChange({id: picker.id, oldValue: false, value: true});
            expect(inputEl['aria-expanded']).toBe(false);
        } finally {
            field.destroy();
        }
    });

    test('DateSelector renders WAI-ARIA grid, columnheader aria-label, roving gridcell tabIndex, nav button keyboard handlers, and selection states', async () => {
        const selector = Neo.create(DateSelector, {
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
            expect(prevBtn.tabIndex).toBe(0);
            expect(prevBtn['aria-label']).toBe('Previous Month');
            expect(nextBtn.role).toBe('button');
            expect(nextBtn.tabIndex).toBe(0);
            expect(nextBtn['aria-label']).toBe('Next Month');

            expect(centerRegion.id).toBe(`${selector.id}__header-center`);
            expect(centerRegion['aria-live']).toBe('polite');

            expect(gridEl.role).toBe('grid');
            expect(gridEl['aria-labelledby']).toBe(`${selector.id}__header-center`);

            expect(headerRow.role).toBe('row');
            expect(headerRow.cn.map(cell => cell.role)).toEqual(Array(7).fill('columnheader'));
            expect(headerRow.cn.map(cell => cell['aria-label'])).toEqual([
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

            // Selected vs unselected in-range cell and roving tabIndex
            expect(selectedCell['aria-selected']).toBe(true);
            expect(selectedCell.tabIndex).toBe(0);
            expect(selectedCell['aria-disabled']).toBeUndefined();
            expect(inRangeCell['aria-selected']).toBeUndefined();
            expect(inRangeCell.tabIndex).toBe(-1);
            expect(inRangeCell['aria-disabled']).toBeUndefined();

            // Disabled cells (outside min/max range and adjacent-month overflow)
            expect(beforeMinCell['aria-disabled']).toBe(true);
            expect(afterMaxCell['aria-disabled']).toBe(true);
            expect(prevMonthCell['aria-disabled']).toBe(true);
            expect(prevMonthCell.tabIndex).toBeNull();

            // Selection change updates aria-selected and roving tabIndex via SelectionModel
            selector.selectDate('2026-05-16');
            await selector.promiseUpdate();

            expect(selector.getVdomChild(`${selector.id}__2026-05-15`)['aria-selected']).toBeUndefined();
            expect(selector.getVdomChild(`${selector.id}__2026-05-15`).tabIndex).toBe(-1);
            expect(selector.getVdomChild(`${selector.id}__2026-05-16`)['aria-selected']).toBe(true);
            expect(selector.getVdomChild(`${selector.id}__2026-05-16`).tabIndex).toBe(0);

            // Dynamic updateHeaderDays updates aria-label when dayNameFormat and locale change
            selector.dayNameFormat = 'narrow';
            await selector.promiseUpdate();
            expect(selector.getCenterContentEl().cn[0].cn.map(cell => cell['aria-label'])).toEqual([
                'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
            ]);

            selector.locale = 'de-DE';
            await selector.promiseUpdate();
            expect(selector.getCenterContentEl().cn[0].cn.map(cell => cell['aria-label'])).toEqual([
                'Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'
            ]);

            // Header button keyboard activation (Enter / Space) changes month
            selector.locale   = 'en-US';
            selector.minValue = null;
            selector.maxValue = null;
            selector.onNavButtonKeyDown({path: [{cls: ['neo-next-button']}]});
            await selector.promiseUpdate();
            expect(selector.value).toBe('2026-06-16');

            selector.onNavButtonKeyDown({path: [{cls: ['neo-prev-button']}]});
            await selector.promiseUpdate();
            expect(selector.value).toBe('2026-05-16');
        } finally {
            selector.destroy();
        }
    });

    test('a rebuilt grid and a new selector use the current local day after midnight', async () => {
        const NativeDate = globalThis.Date,
              dayBefore  = '2041-01-19',
              dayAfter   = '2041-01-20',
              instances  = [],
              create     = config => {
                  const instance = Neo.create(DateSelector, {appName, useAnimations: false, ...config});
                  instances.push(instance);
                  return instance
              };

        let now = new NativeDate(2041, 0, 19, 23, 59, 59).getTime();

        globalThis.Date = class FixedDate extends NativeDate {
            static now() {
                return now
            }

            constructor(...args) {
                super(...(args.length ? args : [now]))
            }
        };

        try {
            const selector = create({value: dayBefore}),
                  cell     = day => selector.getVdomChild(`${selector.id}__${day}`);

            await selector.initVnode();
            selector.mounted = true;
            expect(cell(dayBefore)['aria-current']).toBe('date');
            expect(cell(dayBefore).cn[0].cls).toContain('neo-today');

            now = new NativeDate(2041, 0, 20, 0, 0, 1).getTime();
            selector.recreateDayViewContent();
            await selector.promiseUpdate();

            expect(selector.value).toBe(dayBefore);
            expect(cell(dayBefore)['aria-selected']).toBe(true);
            expect(cell(dayBefore).tabIndex).toBe(0);
            expect(cell(dayBefore)['aria-current']).toBeUndefined();
            expect(cell(dayBefore).cn[0].cls).not.toContain('neo-today');
            expect(cell(dayAfter)['aria-current']).toBe('date');
            expect(cell(dayAfter).cn[0].cls).toContain('neo-today');
            expect(create({}).value).toBe(dayAfter);

            globalThis.Date = NativeDate;
            expect(create({value: new Date(2041, 0, 15, 12)}).value).toBe('2041-01-15')
        } finally {
            globalThis.Date = NativeDate;
            instances.forEach(instance => instance.destroy())
        }
    });
});
