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

/**
 * @summary Waits for the selector's update and any queued month/year work to settle.
 * @param {Neo.component.DateSelector} selector
 * @returns {Promise<void>}
 */
async function settle(selector) {
    await expect.poll(async () => {
        await selector.promiseUpdate();
        return selector.isUpdating
    }).toBe(false)
}

test.describe('Neo.selection.DateSelectorModel', () => {
    test('selectOnNavigate: false keeps the committed date until Enter', async () => {
        const selector = Neo.create(DateSelector, {
            appName,
            selectionModel: {selectOnNavigate: false},
            useAnimations : false,
            value         : '2026-01-15'
        });

        try {
            await selector.initVnode();
            selector.mounted = true;

            const model      = selector.selectionModel,
                  selectedId = `${selector.id}__2026-01-15`,
                  targetId   = `${selector.id}__2026-01-17`,
                  changes    = [], selections = [];

            expect(model.toJSON().selectOnNavigate).toBe(false);
            selector.on('change', data => changes.push(data.value));
            selector.on('select', data => selections.push([...data.selection]));

            model.onKeyDownRight({});
            expect(selector.value).toBe('2026-01-15');
            expect(model.items).toEqual([selectedId]);

            model.onKeyDownRight({});
            await settle(selector);

            expect(selector.value).toBe('2026-01-15');
            expect(selector.getVdomChild(selectedId).cls).toContain('neo-selected');
            expect(selector.getVdomChild(targetId).cls).toContain('neo-navigated');
            expect(selector.getVdomChild(targetId).cls).not.toContain('neo-selected');
            expect(selector.getVdomChild(`${selector.id}__2026-01-16`).cls).not.toContain('neo-navigated');
            expect(changes).toEqual([]);
            expect(selections).toEqual([]);

            model.onKeyDownEnter({});
            await settle(selector);

            expect(selector.value).toBe('2026-01-17');
            expect(model.items).toEqual([targetId]);
            expect(selector.getVdomChild(targetId).cls).toContain('neo-selected');
            expect(changes).toEqual(['2026-01-17']);
            expect(selections).toEqual([[targetId]]);
        } finally {
            selector.destroy();
        }
    });

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
        expect(selector.selectionModel.selectOnNavigate).toBe(true);
        expect(selector.selectionModel.toJSON().selectOnNavigate).toBe(true);

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

    test('opt-out column and row navigation wraps and continues from the preview without selecting it', async () => {
        const selector = Neo.create(DateSelector, {
            appName,
            selectionModel: {selectOnNavigate: false},
            useAnimations : false,
            value         : '2026-01-31'
        });

        try {
            await selector.initVnode();
            selector.mounted = true;

            const model = selector.selectionModel;

            for (const [method, date] of [
                ['onKeyDownRight', '2026-01-01'],
                ['onKeyDownRight', '2026-01-02'],
                ['onKeyDownLeft',  '2026-01-01'],
                ['onKeyDownLeft',  '2026-01-31']
            ]) {
                model[method]({});
                await settle(selector);
                expect(selector.getVdomChild(`${selector.id}__${date}`).cls).toContain('neo-navigated');
                expect(selector.value).toBe('2026-01-31');
                expect(model.items).toEqual([`${selector.id}__2026-01-31`])
            }

            selector.value = '2026-01-28';
            await settle(selector);

            for (const [method, date] of [
                ['onKeyDownDown', '2026-01-01'],
                ['onKeyDownDown', '2026-01-08'],
                ['onKeyDownUp',   '2026-01-01'],
                ['onKeyDownUp',   '2026-01-28'],
                ['onKeyDownUp',   '2026-01-21']
            ]) {
                model[method]({});
                await settle(selector);
                expect(selector.getVdomChild(`${selector.id}__${date}`).cls).toContain('neo-navigated');
                expect(selector.value).toBe('2026-01-28');
                expect(model.items).toEqual([`${selector.id}__2026-01-28`])
            }

            model.onKeyDownEnter({});
            expect(selector.value).toBe('2026-01-21');
            expect(model.items).toEqual([`${selector.id}__2026-01-21`])
        } finally {
            selector.destroy()
        }
    });

    test('opt-out month and year navigation renders the preview while the committed date stays unchanged', async () => {
        const selector = Neo.create(DateSelector, {
            appName,
            selectionModel: {selectOnNavigate: false, stayInMonth: false},
            useAnimations : false,
            value         : '2025-12-31'
        });

        try {
            await selector.initVnode();
            selector.mounted = true;

            const model = selector.selectionModel;

            for (const [method, date] of [
                ['onKeyDownRight', '2026-01-01'],
                ['onKeyDownDown',  '2026-01-08'],
                ['onKeyDownUp',    '2026-01-01'],
                ['onKeyDownLeft',  '2025-12-31'],
                ['onKeyDownUp',    '2025-12-24'],
                ['onKeyDownRight', '2025-12-25'],
                ['onKeyDownDown',  '2026-01-01']
            ]) {
                model[method]({});
                await settle(selector);
                expect(selector.getVdomChild(`${selector.id}__${date}`).cls).toContain('neo-navigated');
                expect(selector.getHeaderYearEl().text).toBe(Number(date.slice(0, 4)));
                expect(selector.value).toBe('2025-12-31');
                expect(model.items).toEqual([`${selector.id}__2025-12-31`])
            }

            model.onKeyDownEnter({});
            await settle(selector);
            expect(selector.value).toBe('2026-01-01');
            expect(model.items).toEqual([`${selector.id}__2026-01-01`]);
            expect(selector.getVdomChild(`${selector.id}__2026-01-01`).cls).toContain('neo-selected')
        } finally {
            selector.destroy()
        }
    });

    test('pointer and programmatic selection replace the preview before subsequent navigation and Enter', async () => {
        const selector = Neo.create(DateSelector, {
            appName,
            selectionModel: {selectOnNavigate: false},
            useAnimations : false,
            value         : '2026-01-15'
        });

        try {
            await selector.initVnode();
            selector.mounted = true;

            const model = selector.selectionModel;

            model.onKeyDownRight({});
            selector.onCellClick({path: [{id: `${selector.id}__2026-01-20`}]});
            await settle(selector);
            expect(selector.value).toBe('2026-01-20');
            expect(model.items).toEqual([`${selector.id}__2026-01-20`]);
            expect(selector.getVdomChild(`${selector.id}__2026-01-16`).cls).not.toContain('neo-navigated');

            model.onKeyDownRight({});
            await settle(selector);
            expect(selector.getVdomChild(`${selector.id}__2026-01-21`).cls).toContain('neo-navigated');
            expect(selector.value).toBe('2026-01-20');

            selector.value = '2026-03-05';
            await settle(selector);
            model.onKeyDownRight({});
            await settle(selector);
            expect(selector.getVdomChild(`${selector.id}__2026-03-06`).cls).toContain('neo-navigated');
            expect(selector.value).toBe('2026-03-05');
            expect(model.items).toEqual([`${selector.id}__2026-03-05`]);

            model.onKeyDownEnter({});
            await settle(selector);
            expect(selector.value).toBe('2026-03-06');
            expect(model.items).toEqual([`${selector.id}__2026-03-06`])
        } finally {
            selector.destroy()
        }
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
