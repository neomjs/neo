import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'HighlightComponentTest'
    }
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../src/Neo.mjs';
import * as core        from '../../../../../src/core/_export.mjs';
import Component        from '../../../../../src/component/Base.mjs';
import ComponentService from '../../../../../src/ai/client/ComponentService.mjs';

const appName = 'HighlightComponentTest';

/**
 * `highlight_component` paints for `duration` and then restores exactly the keys it wrote — by
 * value, `null` where the component had none. `Neo.component.Base#style_` merges shallow: an
 * object that lacks a key never removes it, so a restore that assigns the pre-highlight object
 * leaves the outline or box-shadow on the component and its vdom root for the life of the
 * instance — the stuck frame an operator sees minutes after a demo highlight.
 */
test.describe('Neo.ai.client.ComponentService#highlightComponent — the restore removes what the highlight wrote', () => {
    let component = null,
        service   = null;

    test.beforeEach(() => {
        service = Neo.create(ComponentService)
    });

    test.afterEach(() => {
        component?.destroy();
        component = null;
        service.destroy();
        service = null
    });

    test('outline mode: after the duration, neither the component style nor the vdom root carries the outline', async () => {
        component = Neo.create(Component, {appName, style: {color: 'rgb(1, 2, 3)'}});

        expect(service.highlightComponent({componentId: component.id, options: {color: 'blue', duration: 5}})).toEqual({success: true});
        expect(component.style.outline, 'the highlight is painted').toBe('2px solid blue');
        expect(component.vdom.style.outlineOffset, 'the vdom root carries the highlight').toBe('-2px');

        await service.timeout(30);

        expect(component.style.outline ?? null, 'the component style carries no outline').toBeNull();
        expect(component.style.outlineOffset ?? null).toBeNull();
        expect(component.vdom.style.outline ?? null, 'the vdom root carries no outline').toBeNull();
        expect(component.vdom.style.outlineOffset ?? null).toBeNull();
        expect(component.style.color, 'an unrelated key survives the highlight and the restore').toBe('rgb(1, 2, 3)')
    });

    test('box-shadow mode: after the duration, neither the component style nor the vdom root carries the box-shadow', async () => {
        component = Neo.create(Component, {appName});

        service.highlightComponent({componentId: component.id, options: {duration: 5, style: 'box-shadow'}});
        expect(component.style.boxShadow, 'the highlight is painted').toBe('0 0 10px red, inset 0 0 10px red');

        await service.timeout(30);

        expect(component.style.boxShadow ?? null, 'the component style carries no box-shadow').toBeNull();
        expect(component.vdom.style.boxShadow ?? null, 'the vdom root carries no box-shadow').toBeNull()
    });

    test('a pre-existing value of a highlighted key is restored, not nulled', async () => {
        component = Neo.create(Component, {appName, style: {outline: '1px dotted green'}});

        service.highlightComponent({componentId: component.id, options: {duration: 5}});
        expect(component.style.outline, 'the highlight replaces the value for the duration').toBe('2px solid red');

        await service.timeout(30);

        expect(component.style.outline, 'the original value is back').toBe('1px dotted green');
        expect(component.vdom.style.outline).toBe('1px dotted green');
        expect(component.style.outlineOffset ?? null, 'the key the component never had is gone').toBeNull()
    });

    test('a component destroyed during the highlight does not throw on restore', async () => {
        component = Neo.create(Component, {appName});

        const {id} = component;

        service.highlightComponent({componentId: id, options: {duration: 5}});
        component.destroy();
        component = null;

        await service.timeout(30);

        expect(Neo.getComponent(id) ?? null, 'the component stays gone and the restore raised nothing').toBeNull()
    })
});
