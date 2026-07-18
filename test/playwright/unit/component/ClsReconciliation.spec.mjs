/**
 * @summary RED witness — reapplying an unchanged authored `cls` must not strip a config-derived
 * class while its owning config is unchanged.
 *
 * `afterSetDisabled` adds `neo-disabled` into the shared `cls` bag (same mechanism as `ui` adding
 * `neo-<ntype>-<ui>`). A pooled consumer that reapplies ONLY its authored classes — unaware of the
 * derived ones — must not lose them: `afterSetCls`'s `NeoArray.remove(cls, difference(oldValue, value))`
 * currently strips every derived class absent from the reapplied authored value, and because `disabled`
 * did not change, `afterSetDisabled` never re-runs to restore it. This spec fails against unfixed
 * `component.Base` and turns green once cls reconciliation is ownership-safe.
 */
import {setup} from '../../setup.mjs';

const appName = 'ClsReconciliationTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {name: appName}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Component      from '../../../../src/component/Base.mjs';

test.describe('component.Base cls reconciliation (#15197)', () => {
    test('reapplying authored cls preserves a config-derived class while its owner is unchanged', async () => {
        const cmp = Neo.create(Component, {appName, cls: ['authored'], disabled: true});

        // Sanity: the config-derived class landed in the rendered cls alongside the authored one.
        expect(cmp.vdom.cls, 'derived neo-disabled present after construction').toContain('neo-disabled');
        expect(cmp.vdom.cls, 'authored class present after construction').toContain('authored');

        // A pooled consumer reapplies ONLY its authored classes (it does not know about neo-disabled).
        cmp.cls = ['authored'];

        // disabled is unchanged, so the derived class must survive the reapply.
        expect(cmp.disabled, 'disabled semantic state is unchanged').toBe(true);
        expect(cmp.vdom.cls, 'neo-disabled must survive an authored-cls reapply (config-derived, owner unchanged)').toContain('neo-disabled');
        expect(cmp.vdom.cls, 'authored class still present after reapply').toContain('authored');

        cmp.destroy()
    });
});
