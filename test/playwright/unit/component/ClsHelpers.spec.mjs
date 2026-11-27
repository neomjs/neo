import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ComponentClsHelpersTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import SplitButton    from '../../../../src/button/Split.mjs';
import Component      from '../../../../src/component/Base.mjs';

const appName = 'ComponentClsHelpersTest';

/**
 * `removeAddCls()` exists because the `*Cls` family could not express a swap. Each of
 * `addCls`, `removeCls` and `toggleCls` assigns `cls`, and `afterSetCls` ends in `update()`,
 * so composing two of them issues two updates where one assignment issues one.
 *
 * These arms therefore count `update()` calls. An assertion on the resulting class SET cannot
 * see the cost — both forms reach the same classes, and the extra update mutates none of them,
 * so a DOM-state witness passes while the work doubles. The composed form below is kept as a
 * positive control: it proves the counter can report two, which is the only reason its one for
 * `removeAddCls` means anything.
 */
test.describe('Neo.component.Base class helpers', () => {
    let component = null,
        updates   = 0;

    /**
     * @summary Builds a component and counts calls to its original `update()` method.
     * @param {String[]} cls
     * @param {Class} [module=Component]
     * @returns {Neo.component.Base}
     */
    function create(cls, module=Component) {
        const instance = Neo.create(module, {appName, cls}),
              update   = instance.update;

        updates = 0;

        instance.update = function() {
            updates++;
            return update.apply(this, arguments)
        };

        return instance
    }

    test.afterEach(() => {
        component?.destroy();
        component = null
    });

    test('a swap issues exactly one update', () => {
        component = create(['unrelated', 'size-small']);

        component.removeAddCls('size-small', 'size-large');

        expect(updates).toBe(1);
        expect(component.cls).toEqual(['unrelated', 'size-large'])
    });

    test('addCls adds multiple root classes in one update', () => {
        component = create(['unrelated']);
        component.addCls(['a', 'b']);

        expect(updates).toBe(1);
        expect(component.cls).toEqual(['unrelated', 'a', 'b']);
        expect(component.getVdomRoot().cls).toEqual(expect.arrayContaining(['unrelated', 'a', 'b']))
    });

    test('addWrapperCls adds multiple wrapper classes in one update', () => {
        component = create(['unrelated'], SplitButton);
        const root       = component.getVdomRoot(),
              rootConfig = component.cls,
              rootCls    = [...root.cls],
              wrapperCls = [...component.vdom.cls];

        expect(root).not.toBe(component.vdom);
        component.addWrapperCls(['w1', 'w2']);

        expect(updates).toBe(1);
        expect(component.wrapperCls).toEqual(['w1', 'w2']);
        expect(component.vdom.cls).toEqual(expect.arrayContaining([...wrapperCls, 'w1', 'w2']));
        expect(root.cls).toEqual(rootCls);
        expect(component.cls).toEqual(rootConfig)
    });

    test('removeCls removes multiple root classes in one update', () => {
        component = create(['unrelated', 'a', 'b']);
        component.removeCls(['a', 'b']);

        expect(updates).toBe(1);
        expect(component.cls).toEqual(['unrelated']);
        expect(component.getVdomRoot().cls).toContain('unrelated');
        expect(component.getVdomRoot().cls).not.toContain('a');
        expect(component.getVdomRoot().cls).not.toContain('b')
    });

    test('the composed form issues two — the control that makes the count meaningful', () => {
        component = create(['unrelated', 'size-small']);

        component.removeCls('size-small');
        component.addCls('size-large');

        expect(updates).toBe(2);
        expect(component.cls).toEqual(['unrelated', 'size-large'])
    });

    test('both forms reach the identical class set, so a set assertion cannot tell them apart', () => {
        const viaSwap = create(['unrelated', 'size-small']);

        viaSwap.removeAddCls('size-small', 'size-large');

        const swapped = viaSwap.cls;

        viaSwap.destroy();

        component = create(['unrelated', 'size-small']);
        component.removeCls('size-small');
        component.addCls('size-large');

        expect(component.cls).toEqual(swapped)
    });

    test('arrays are accepted on both sides, still in one update', () => {
        component = create(['unrelated', 'sort-desc', 'sort-hidden']);

        component.removeAddCls(['sort-desc', 'sort-hidden'], 'sort-asc');

        expect(updates).toBe(1);
        expect(component.cls).toEqual(['unrelated', 'sort-asc'])
    });

    test('a repeated swap is idempotent and leaves unrelated classes untouched', () => {
        component = create(['unrelated', 'size-small']);

        component.removeAddCls('size-small', 'size-large');
        component.removeAddCls('size-small', 'size-large');

        expect(component.cls).toEqual(['unrelated', 'size-large'])
    });

    test('the aggregate value stays a copy — a mutated read cannot reach the component', () => {
        component = create(['unrelated', 'size-small']);

        const read = component.cls;

        read.push('injected');

        expect(component.cls).toEqual(['unrelated', 'size-small'])
    });
});
