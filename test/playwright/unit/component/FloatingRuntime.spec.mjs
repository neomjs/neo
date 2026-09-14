/**
 * @file test/playwright/unit/component/FloatingRuntime.spec.mjs
 * @summary Pins `floating` as a runtime-capable config: the rendered `neo-floating` class follows
 * the config in both directions, and a component that never floats never gains it.
 *
 * Why the class is the assertion rather than the position: `neo-floating` is what carries
 * `position: fixed` (`resources/scss/src/component/Base.scss:23`), so the class IS the contract the
 * DOM reads. Alignment and focus ride on top of it and belong to the mounted tier.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'FloatingRuntimeTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Button         from '../../../../src/button/Base.mjs';
import Component      from '../../../../src/component/Base.mjs';

// Imported for its side effect: `manager/Instance.mjs:37` assigns `Neo.get`, which the component
// parent-walk needs. Without it, teardown throws inside `afterEach` and reads as an arm failure.
import '../../../../src/manager/Instance.mjs';

const appName = 'FloatingRuntimeTest';

test.describe('component.Base floating as a runtime config', () => {
    let instances = [];

    const create = (module, config) => {
        const instance = Neo.create(module, {appName, ...config});

        instances.push(instance);

        return instance
    };

    test.afterEach(() => {
        instances.forEach(instance => !instance.isDestroyed && instance.destroy());
        instances = []
    });

    test('a component created floating carries the class, and one created without it does not', () => {
        expect(create(Component, {floating: true}).cls, 'floating: true renders neo-floating')
            .toContain('neo-floating');
        expect(create(Component, {}).cls, 'the default is not floating')
            .not.toContain('neo-floating')
    });

    test('flipping floating on at runtime adds the class', () => {
        const component = create(Component, {});

        expect(component.cls).not.toContain('neo-floating');

        component.floating = true;

        expect(component.floating, 'the config reports the new value').toBe(true);
        expect(component.cls, 'and the rendered class follows it — the defect is that it did not')
            .toContain('neo-floating')
    });

    test('flipping floating off at runtime removes the class, and leaves the rest alone', () => {
        const component = create(Component, {cls: ['authored-one'], floating: true});

        expect(component.cls).toContain('neo-floating');

        component.floating = false;

        expect(component.floating).toBe(false);
        expect(component.cls, 'neo-floating is gone').not.toContain('neo-floating');
        expect(component.cls, 'the authored class is untouched').toContain('authored-one')
    });

    test('repeated assignment of the same value is inert, and the class list never duplicates', () => {
        const component = create(Component, {floating: true});

        component.floating = true;
        component.floating = true;

        expect(component.cls.filter(cls => cls === 'neo-floating'), 'exactly one neo-floating')
            .toHaveLength(1)
    });

    test('a Button keeps its own base classes across a floating flip', () => {
        // The Button rung matters on its own: `.neo-button` sets `position: relative` and
        // `.neo-button.neo-floating` is the higher-specificity rule that restores `fixed`
        // (`resources/scss/src/button/Base.scss:40`). A flip that dropped `neo-button` would leave
        // the compound selector unmatched and the button mispositioned rather than unstyled.
        const button = create(Button, {text: 'Probe'});

        button.floating = true;

        expect(button.cls, 'the floating class arrives').toContain('neo-floating');
        expect(button.cls, 'and neo-button survives it').toContain('neo-button');

        button.floating = false;

        expect(button.cls, 'the floating class leaves').not.toContain('neo-floating');
        expect(button.cls, 'and neo-button is still there').toContain('neo-button')
    })
})
