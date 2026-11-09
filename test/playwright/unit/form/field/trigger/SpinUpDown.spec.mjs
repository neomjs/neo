import { test, expect } from '@playwright/test';
import { setup }        from '../../../../setup.mjs';

test.describe('Neo.form.field.trigger.SpinUpDown', () => {
    let installedStub = false;

    test.beforeAll(async () => {
        await import('../../../../../../src/Neo.mjs');
        await setup();
        await import('../../../../../../src/core/_export.mjs');
        await import('../../../../../../src/form/field/trigger/SpinUpDown.mjs');
        await import('../../../../../../src/form/field/Number.mjs');

        // Install main-thread stub if missing to prevent DomEvents error
        const main = Neo.ns('Neo.main', true);
        if (!main.DomEvents) {
            main.DomEvents = {
                registerDisabledInputChars() {},
                unregisterDisabledInputChars() {}
            };
            installedStub = true;
        }
    });

    test.afterAll(() => {
        if (installedStub) {
            delete Neo.ns('Neo.main', true).DomEvents;
        }
    });

    test("a NumberField's spin trigger vdom.cn has two buttons with correct default classes", async () => {
        const field = Neo.create('Neo.form.field.Number', { appName: 'TestApp' });
        const trigger = field.getTrigger('spinupdown');
        const cn = trigger.vdom.cn;

        expect(cn.length).toBe(2);
        expect(cn[0].cls).toEqual(['neo-spin-button', 'neo-up', 'fa', 'fa-chevron-up']);
        expect(cn[1].cls).toEqual(['neo-spin-button', 'neo-down', 'fa', 'fa-chevron-down']);
    });

    test('custom spinButtonUpIconCls / spinButtonDownIconCls are split into class lists', async () => {
        const trigger = Neo.create('Neo.form.field.trigger.SpinUpDown', {
            appName: 'TestApp',
            spinButtonUpIconCls: 'custom-up-icon extra-up',
            spinButtonDownIconCls: 'custom-down-icon extra-down'
        });

        const cn = trigger.vdom.cn;

        expect(cn[0].cls).toEqual(['neo-spin-button', 'neo-up', 'custom-up-icon', 'extra-up']);
        expect(cn[1].cls).toEqual(['neo-spin-button', 'neo-down', 'custom-down-icon', 'extra-down']);
    });

    test("onTriggerClick with neo-up calls field's onSpinButtonUpClick()", async () => {
        const field = Neo.create('Neo.form.field.Number', { appName: 'TestApp' });
        const trigger = field.getTrigger('spinupdown');
        let upCalled = false;
        field.onSpinButtonUpClick = () => { upCalled = true; };

        trigger.onTriggerClick({ path: [{ cls: ['neo-spin-button', 'neo-up'] }] });

        expect(upCalled).toBe(true);
    });

    test("onTriggerClick with neo-down calls field's onSpinButtonDownClick()", async () => {
        const field = Neo.create('Neo.form.field.Number', { appName: 'TestApp' });
        const trigger = field.getTrigger('spinupdown');
        let downCalled = false;
        field.onSpinButtonDownClick = () => { downCalled = true; };

        trigger.onTriggerClick({ path: [{ cls: ['neo-spin-button', 'neo-down'] }] });

        expect(downCalled).toBe(true);
    });

    test('a click whose target has neither class calls neither click handler', async () => {
        const field = Neo.create('Neo.form.field.Number', { appName: 'TestApp' });
        const trigger = field.getTrigger('spinupdown');
        let upCalled = false;
        let downCalled = false;
        field.onSpinButtonUpClick = () => { upCalled = true; };
        field.onSpinButtonDownClick = () => { downCalled = true; };

        trigger.onTriggerClick({ path: [{ cls: ['neo-spin-button', 'unrelated-class'] }] });

        expect(upCalled).toBe(false);
        expect(downCalled).toBe(false);
    });

    test('toJSON() includes spinButtonUpIconCls and spinButtonDownIconCls', async () => {
        const field = Neo.create('Neo.form.field.Number', { appName: 'TestApp' });
        const trigger = field.getTrigger('spinupdown');
        const json = trigger.toJSON();

        expect(json.spinButtonUpIconCls).toBeDefined();
        expect(json.spinButtonDownIconCls).toBeDefined();
    });
});
