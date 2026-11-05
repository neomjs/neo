import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'TextCharacterCountTest'}});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import Text               from '../../../../../src/form/field/Text.mjs';
import TextArea           from '../../../../../src/form/field/TextArea.mjs';
import VDomHelper         from '../../../../../src/vdom/Helper.mjs';
import VDomUtil           from '../../../../../src/util/VDom.mjs';

/**
 * @summary Counter state follows field reset semantics and owns only its own accessible description.
 */
test.describe('Text character counter', () => {
    for (const module of [Text, TextArea]) {
        test(`${module.name} exposes custom counter text as the input's description`, async () => {
            const field = Neo.create(module, {
                characterCountText: ({length, maxLength}) => maxLength == null ?
                    `${length} characters` : `${length} of ${maxLength} characters`,
                maxLength         : 20,
                showCharacterCount: true,
                value             : 'seed'
            });
            await field.ready();
            const counter = () => VDomUtil.find(field.vdom, {cls: 'neo-textfield-character-count'}).vdom;
            try {
                expect(counter().text).toBe('4 of 20 characters');
                expect(counter().id).toBe(`${field.id}__character-count`);
                expect(field.getInputEl()['aria-describedby']).toBe(counter().id);
                field.value = 'changed';
                expect(counter().text).toBe('7 of 20 characters');
                field.maxLength = null;
                expect(counter().text).toBe('7 characters');
                field.maxLength = 0;
                expect(counter().text).toBe('7 of 0 characters')
            } finally {
                field.destroy()
            }
        });

        test(`${module.name} resets the count with the field's original-value policy`, async () => {
            const field = Neo.create(module, {value: 'seed', maxLength: 20, clearToOriginalValue: true,
                showCharacterCount: true});
            await field.ready();
            const counter = () => VDomUtil.find(field.vdom, {cls: 'neo-textfield-character-count'}).vdom;
            try {
                expect(counter().text).toBe('4 / 20');
                field.value = 'changed';
                expect(counter().text).toBe('7 / 20');
                field.reset();
                expect(field.value).toBe('seed');
                expect(counter().text).toBe('4 / 20');
                field.clearToOriginalValue = false;
                field.clear();
                expect(counter().text).toBe('0 / 20');
                field.reset('again');
                expect(counter().text).toBe('5 / 20');
                expect(field.toJSON().showCharacterCount).toBe(true)
            } finally {
                field.destroy()
            }
        });
    }

    test('counter toggles preserve descriptions owned by a consumer', async () => {
        const field = Neo.create(Text, {value: 'seed'});
        await field.ready();
        const input = field.getInputEl(), counterId = `${field.id}__character-count`;
        try {
            input['aria-describedby'] = 'help-message policy-message';
            field.showCharacterCount = true;
            expect(input['aria-describedby']).toBe(`help-message policy-message ${counterId}`);
            field.value = 'next';
            expect(input['aria-describedby']).toBe(`help-message policy-message ${counterId}`);
            field.showCharacterCount = false;
            expect(input['aria-describedby']).toBe('help-message policy-message')
        } finally {
            field.destroy()
        }
    });
});
