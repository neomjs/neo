/**
 * @file test/playwright/unit/form/FieldsetLegend.spec.mjs
 * @summary Pins that a fieldset's legend changes reach the DOM: an emptied legend leaves it, and a renamed legend
 * keeps its new text when a child's own update merges into the fieldset's cycle.
 *
 * `updateLegend()` changes the legend silently and relies on the fieldset's depth-2 update to carry it. When a
 * child's own update merges into that cycle, a sparse payload would prune the legend to a reference.
 */

import {setup} from '../../setup.mjs';

const appName = 'FieldsetLegendTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Button         from '../../../../src/button/Base.mjs';
import Fieldset       from '../../../../src/form/Fieldset.mjs';
import VdomHelper     from '../../../../src/vdom/Helper.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

test.describe('form.Fieldset: legend changes reach the DOM', () => {
    let applyDeltas, deltas, fieldset;

    test.beforeEach(async () => {
        applyDeltas = Neo.applyDeltas;
        deltas      = [];

        fieldset = Neo.create(Fieldset, {
            appName,
            iconClsChecked: '',
            title         : 'Seat',
            items         : [{module: Button, text: 'Change'}]
        });

        await fieldset.initVnode();
        fieldset.mounted = true;

        // One settled update leaves the fieldset at its default depth, the state a live app is in
        await fieldset.promiseUpdate();

        Neo.applyDeltas = async (windowId, payload) => {
            deltas.push(...[payload].flat())
        }
    });

    test.afterEach(() => {
        Neo.applyDeltas = applyDeltas;
        fieldset?.destroy();
        fieldset = null
    });

    const settled = () => expect.poll(() => !fieldset.isVdomUpdating && !fieldset.needsVdomUpdate).toBe(true);

    test('an emptied legend leaves the DOM', async () => {
        const {legend} = fieldset;

        fieldset.title = '';
        await settled();

        expect(legend.vdom.removeDom).toBe(true);
        expect(deltas.some(delta => delta.action === 'removeNode' && delta.id === legend.id)).toBe(true)
    });

    test('a renamed legend keeps its text when a child update merges into the cycle', async () => {
        const
            {legend}  = fieldset,
            [, child] = fieldset.items;

        // The second rename finds the first flight in the air, so the child's own update merges into the next cycle
        fieldset.title = 'Seat model';
        fieldset.title = 'Seat model and effort';
        child.text     = 'Close';
        await settled();
        await expect.poll(() => !child.isVdomUpdating && !child.needsVdomUpdate).toBe(true);

        // A text child changes through `updateVtext`, the legend's own text node
        const sent = deltas.filter(delta => delta.action === 'updateVtext' && delta.parentId === legend.id).map(delta => delta.value);

        expect(sent).toContain('Seat model and effort');
        expect(legend.text).toBe('Seat model and effort')
    })
});
