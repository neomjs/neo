import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'ComponentMeasureTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * @summary `component.Base#measure()` answers px itself for a number or a px length, asks the main thread for any
 * other absolute or font-relative length, and hands a percentage back unchanged.
 *
 * The main thread's own answer is pinned in `component/component/Measure.spec.mjs` on a real DOM. These arms pin
 * which values reach it, with `Neo.main.DomAccess.measure()` replaced by a recorder.
 */
test.describe('component.Base#measure', () => {
    let component, original, sent;

    test.beforeEach(() => {
        sent      = [];
        original  = Neo.main.DomAccess.measure;
        component = Neo.create(Component, {appName: 'ComponentMeasureTest'});

        Neo.main.DomAccess.measure = ({value}) => {
            sent.push(value);
            return Promise.resolve(24)
        }
    });

    test.afterEach(() => {
        Neo.main.DomAccess.measure = original;
        component.destroy()
    });

    test('a fractional font-relative length is measured by the main thread', async () => {
        expect(await component.measure('1.5em')).toBe(24);
        expect(sent).toEqual(['1.5em'])
    });

    test('a px length and a number are answered without a round trip', async () => {
        expect(await component.measure('14.4px')).toBe(14.4);
        expect(await component.measure('12')).toBe(12);
        expect(sent).toEqual([])
    });

    test('a percentage comes back unchanged', async () => {
        expect(await component.measure('50%')).toBe('50%');
        expect(sent).toEqual([])
    })
});
