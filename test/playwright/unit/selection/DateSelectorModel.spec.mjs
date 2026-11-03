import {setup} from '../../setup.mjs';

const appName = 'SelectionDateSelectorModelTest';

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
import DateSelector       from '../../../../src/component/DateSelector.mjs';
import DateSelectorModel  from '../../../../src/selection/DateSelectorModel.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';

test.describe('Neo.selection.DateSelectorModel', () => {
    test('stayInMonth defaults to true and wraps within the current month on column and row navigation', async () => {
        const selector = Neo.create(DateSelector, {
            appName,
            useAnimations: false,
            value        : '2026-01-31'
        });

        await selector.initVnode();
        selector.mounted = true;

        expect(selector.selectionModel).toBeInstanceOf(DateSelectorModel);
        expect(selector.selectionModel.stayInMonth).toBe(true);
        expect(selector.selectionModel.toJSON().stayInMonth).toBe(true);

        // Right arrow on Jan 31 wraps to Jan 01 inside the same month
        selector.selectionModel.onKeyDownRight({});
        expect(selector.value).toBe('2026-01-01');
        expect(selector.selectionModel.items).toEqual([`${selector.id}__2026-01-01`]);

        // Left arrow on Jan 01 wraps back to Jan 31 inside the same month
        selector.selectionModel.onKeyDownLeft({});
        expect(selector.value).toBe('2026-01-31');
        expect(selector.selectionModel.items).toEqual([`${selector.id}__2026-01-31`]);

        // Down arrow on Jan 28 wraps back into January (Jan 01 when stayInColumn: false)
        selector.value = '2026-01-28';
        selector.selectionModel.onKeyDownDown({});
        expect(selector.value).toBe('2026-01-01');

        // Up arrow on Jan 01 wraps back into January (Jan 28 when stayInColumn: false)
        selector.selectionModel.onKeyDownUp({});
        expect(selector.value).toBe('2026-01-28');

        selector.destroy();
    });

    test('stayInMonth: false walks across month and year boundaries on Left/Right and Up/Down navigation', async () => {
        const selector = Neo.create(DateSelector, {
            appName,
            selectionModel: {
                stayInMonth: false
            },
            useAnimations: false,
            value        : '2026-01-31'
        });

        await selector.initVnode();
        selector.mounted = true;

        expect(selector.selectionModel.stayInMonth).toBe(false);
        expect(selector.selectionModel.toJSON().stayInMonth).toBe(false);

        // Right arrow on Jan 31 walks into Feb 01
        selector.selectionModel.onKeyDownRight({});
        await selector.promiseUpdate();
        expect(selector.value).toBe('2026-02-01');
        expect(selector.currentDate.getFullYear()).toBe(2026);
        expect(selector.currentDate.getMonth()).toBe(1);
        expect(selector.getHeaderYearEl().text).toBe(2026);
        expect(selector.selectionModel.items).toEqual([`${selector.id}__2026-02-01`]);

        // Left arrow on Feb 01 walks back into Jan 31
        selector.selectionModel.onKeyDownLeft({});
        await selector.promiseUpdate();
        expect(selector.value).toBe('2026-01-31');
        expect(selector.currentDate.getMonth()).toBe(0);
        expect(selector.selectionModel.items).toEqual([`${selector.id}__2026-01-31`]);

        // Down arrow (+7 days) on Jan 28 walks into Feb 04
        selector.value = '2026-01-28';
        await selector.promiseUpdate();
        selector.selectionModel.onKeyDownDown({});
        await selector.promiseUpdate();
        expect(selector.value).toBe('2026-02-04');
        expect(selector.currentDate.getMonth()).toBe(1);
        expect(selector.selectionModel.items).toEqual([`${selector.id}__2026-02-04`]);

        // Up arrow (-7 days) on Feb 04 walks back into Jan 28
        selector.selectionModel.onKeyDownUp({});
        await selector.promiseUpdate();
        expect(selector.value).toBe('2026-01-28');
        expect(selector.currentDate.getMonth()).toBe(0);
        expect(selector.selectionModel.items).toEqual([`${selector.id}__2026-01-28`]);

        // Year boundary: Left arrow on 2026-01-01 walks into 2025-12-31
        selector.value = '2026-01-01';
        await selector.promiseUpdate();
        selector.selectionModel.onKeyDownLeft({});
        await selector.promiseUpdate();
        expect(selector.value).toBe('2025-12-31');
        expect(selector.currentDate.getFullYear()).toBe(2025);
        expect(selector.currentDate.getMonth()).toBe(11);
        expect(selector.getHeaderYearEl().text).toBe(2025);
        expect(selector.selectionModel.items).toEqual([`${selector.id}__2025-12-31`]);

        // Year boundary: Right arrow on 2025-12-31 walks back into 2026-01-01
        selector.selectionModel.onKeyDownRight({});
        await selector.promiseUpdate();
        expect(selector.value).toBe('2026-01-01');
        expect(selector.currentDate.getFullYear()).toBe(2026);
        expect(selector.currentDate.getMonth()).toBe(0);
        expect(selector.getHeaderYearEl().text).toBe(2026);
        expect(selector.selectionModel.items).toEqual([`${selector.id}__2026-01-01`]);

        // Year boundary via row navigation: Up arrow (-7 days) on 2026-01-04 walks into 2025-12-28
        selector.value = '2026-01-04';
        await selector.promiseUpdate();
        selector.selectionModel.onKeyDownUp({});
        await selector.promiseUpdate();
        expect(selector.value).toBe('2025-12-28');
        expect(selector.currentDate.getFullYear()).toBe(2025);
        expect(selector.currentDate.getMonth()).toBe(11);

        // Down arrow (+7 days) on 2025-12-28 walks back into 2026-01-04
        selector.selectionModel.onKeyDownDown({});
        await selector.promiseUpdate();
        expect(selector.value).toBe('2026-01-04');
        expect(selector.currentDate.getFullYear()).toBe(2026);
        expect(selector.currentDate.getMonth()).toBe(0);

        selector.destroy();
    });
});
