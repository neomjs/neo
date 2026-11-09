import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'CheckBoxGroupTest'}});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import Form               from '../../../../../src/form/Container.mjs';
import CheckBox           from '../../../../../src/form/field/CheckBox.mjs';
import Radio              from '../../../../../src/form/field/Radio.mjs';
import VDomHelper         from '../../../../../src/vdom/Helper.mjs';

let forms = [];

/**
 * @summary Creates real fields inside a form, with independent cleanup for each test.
 * @param {Function} module
 * @param {Object[]} configs
 * @returns {Promise<Neo.form.Container>}
 */
async function createForm(module, configs = [{}, {}, {}]) {
    const form = Neo.create(Form, {
        items: configs.map((config, index) => ({module, name: 'choice', groupRequired: true, value: index, ...config}))
    });
    forms.push(form);
    await form.ready();
    await Promise.all(form.items.map(field => field.ready()));
    return form
}

/**
 * @summary Returns ids of fields whose error text is present in VDOM, without serializing live instances.
 * @param {Neo.form.field.CheckBox[]} fields
 * @returns {String[]}
 */
const errorOwners = fields => fields.filter(field => !field.vdom.cn[1].removeDom).map(field => field.id);

test.afterEach(() => {
    forms.forEach(form => form.destroy());
    forms = []
});

test.describe('Required checkbox and radio groups', () => {
    for (const module of [CheckBox, Radio]) {
        test(`${module.name} keeps every member invalid but shows one group message`, async () => {
            const form = await createForm(module), fields = form.items;
            expect(fields[0].validate(false)).toBe(false);
            expect(errorOwners(fields)).toEqual([fields[2].id]);
            for (const field of fields) {
                expect(field.error).toBe(field.errorTextGroupRequired({name: 'choice'}));
                expect(field.cls).toContain('neo-invalid');
                expect(field.isValid()).toBe(false)
            }
            expect(errorOwners(fields)).toEqual([fields[2].id]);
            fields[0].checked = true;
            expect(fields.every(field => field.isValid())).toBe(true);
            expect(errorOwners(fields)).toEqual([]);
            fields[0].checked = false;
            expect(errorOwners(fields)).toEqual([fields[2].id])
        });

        test(`${module.name} chooses from current order and honors hidden/text opt-outs`, async () => {
            const form = await createForm(module), [first, middle, last] = form.items;
            first.validate(false);
            last.showErrorTexts = false;
            expect(errorOwners(form.items)).toEqual([middle.id]);
            middle.hidden = true;
            first.validate(false);
            expect(errorOwners(form.items)).toEqual([first.id]);
            middle.hidden = false;
            last.showErrorTexts = true;
            form.moveTo(0, 2);
            first.validate(false);
            expect(first.getGroupItems().map(field => field.id)).toEqual(form.items.map(field => field.id));
            expect(errorOwners(form.items)).toEqual([first.id]);
            form.remove(first);
            middle.validate(false);
            expect(errorOwners(form.items)).toEqual([last.id]);
            const inserted = form.insert(0, {module, name: 'choice', groupRequired: true});
            await inserted.ready();
            middle.validate(false);
            expect(errorOwners(form.items)).toEqual([last.id]);
            expect(inserted.getGroupItems().map(field => field.id)).toEqual(form.items.map(field => field.id))
        });

        test(`${module.name} scopes group validity and values to its form`, async () => {
            const first  = await createForm(module, [{}, {}]),
                  second = await createForm(module, [{checked: true, value: 'other'}]);
            expect(first.items[0].validate(false)).toBe(false);
            expect(first.items[0].getGroupValue()).toEqual([]);
            expect(errorOwners(first.items)).toEqual([first.items[1].id]);
            expect(second.items[0].getGroupValue()).toEqual(module === Radio ? 'other' : ['other']);
            first.items[0].checked = true;
            expect(second.items[0].checked).toBe(true)
        });
    }

    test('rendered formGroup names separate groups; renderPath false deliberately shares the raw name', async () => {
        const form = await createForm(Radio, [
            {formGroup: 'first', checked: true},
            {formGroup: 'second', checked: true},
            {formGroup: 'third', renderPath: false},
            {formGroup: 'fourth', renderPath: false}
        ]);
        const [first, second, third, fourth] = form.items;
        expect(first.checked).toBe(true);
        expect(second.checked).toBe(true);
        expect(first.getGroupItems().map(field => field.id)).toEqual([first.id]);
        third.checked = true;
        fourth.checked = true;
        expect(third.checked).toBe(false);
        expect(fourth.getGroupItems(true).map(field => field.id)).toEqual([third.id, fourth.id]);
        expect(fourth.getGroupItems().map(field => field.id)).toEqual([fourth.id]);
        expect(third.getGroupValue()).toEqual([]);
        expect(fourth.getGroupValue()).toBe(3);
        expect(first.checked).toBe(true);
        expect(second.checked).toBe(true)
    });

    test('explicit field errors and individual required errors are not group-message suppression targets', async () => {
        const form                = await createForm(CheckBox, [{groupRequired: false, required: true}, {}, {}]),
              [individual, first] = form.items;
        first.validate(false);
        individual.validate(false);
        expect(individual.error).toBe(individual.errorTextRequired);
        expect(errorOwners(form.items)).toEqual([individual.id, form.items[2].id]);
        first.error = 'Server rejected this choice';
        expect(first.vdom.cn[1].cn[0].text).toBe('Server rejected this choice');
        expect(first.vdom.cn[1].removeDom).toBe(false)
    });

    test('optional choices satisfy the group and releasing its last requirement moves the message', async () => {
        const form                     = await createForm(CheckBox, [{groupRequired: false}, {}, {}]),
              [optional, middle, last] = form.items;
        middle.validate(false);
        optional.checked = true;
        expect(errorOwners(form.items)).toEqual([]);
        expect(middle.error).toBeNull();
        optional.checked = false;
        expect(errorOwners(form.items)).toEqual([last.id]);
        last.groupRequired = false;
        expect(errorOwners(form.items)).toEqual([middle.id]);
        middle.showErrorTexts = false;
        expect(errorOwners(form.items)).toEqual([]);
        expect(middle.isValid()).toBe(false)
    });

    test('unnamed inputs and checkbox/radio types do not become one group', async () => {
        const form = await createForm(Radio, [
            {name: null, checked: true}, {name: null, checked: true},
            {name: 'mixed', checked: true}, {module: CheckBox, name: 'mixed', checked: true}
        ]);
        expect(form.items.every(field => field.checked)).toBe(true);
        for (const field of form.items) {
            expect(field.getGroupItems().map(item => item.id)).toEqual([field.id])
        }
    });

    test('radios outside forms stay independent across windows', async () => {
        const first  = Neo.create(Radio, {name: 'choice', windowId: 1, checked: true}),
              second = Neo.create(Radio, {name: 'choice', windowId: 2, checked: true});
        forms.push(first, second);
        await Promise.all([first.ready(), second.ready()]);
        expect(first.checked).toBe(true);
        expect(second.checked).toBe(true);
        expect(first.getGroupItems().map(field => field.id)).toEqual([first.id]);
        expect(second.getGroupItems().map(field => field.id)).toEqual([second.id])
    });

    test('native selection can span div form containers while validity and values stay in their logical form', async () => {
        const form = Neo.create(Form, {
            items: [1, 2].map(value => ({module: Form, tag: 'div', items: [
                {module: Radio, name: 'choice', value, groupRequired: true, checked: value === 1}
            ]}))
        });
        forms.push(form);
        await form.ready();
        await Promise.all(form.items.map(item => item.ready()));
        const [first, second] = form.items.map(item => item.items[0]);
        await Promise.all([first.ready(), second.ready()]);
        expect(first.getClosestForm()).not.toBe(second.getClosestForm());
        expect(first.getGroupItems(true).map(field => field.id)).toEqual([first.id, second.id]);
        second.checked = true;
        expect(first.checked).toBe(false);
        expect(first.getGroupValue()).toEqual([]);
        expect(second.getGroupValue()).toBe(2);
        expect(first.validate(false)).toBe(false);
        expect(second.validate(false)).toBe(true);
        expect(errorOwners([first, second])).toEqual([first.id])
    });

    test('matching rendered paths format the message with its owning field name', async () => {
        const form = await createForm(CheckBox, [
            {name: 'group.choice'},
            {name: 'choice', formGroup: 'group', errorTextGroupRequired: ({name}) => `Select ${name}`}
        ]);
        form.items[0].validate(false);
        expect(errorOwners(form.items)).toEqual([form.items[1].id]);
        expect(form.items[1].vdom.cn[1].cn[0].text).toBe('Select choice')
    });
});
