import {setup} from '../../../setup.mjs';

const appName = 'FormFieldIdTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true,
        workerId: 'main'
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import CheckBox       from '../../../../../src/form/field/CheckBox.mjs';
import FileUpload     from '../../../../../src/form/field/FileUpload.mjs';
import Text           from '../../../../../src/form/field/Text.mjs';

test.describe('Form Field ID Synchronization', () => {

    test('CheckBox internal IDs should sync', async () => {
        const checkbox = Neo.create(CheckBox, {
            appName,
            id: 'my-cb'
        });

        const labelEl = checkbox.vdom.cn[0];
        
        expect(labelEl.cn[0].id).toBe('my-cb__label');
        expect(labelEl.cn[1].id).toBe('my-cb__input');
        expect(labelEl.cn[2].id).toBe('my-cb__icon');
        expect(labelEl.cn[3].id).toBe('my-cb__value-label');

        checkbox.id = 'new-cb';

        expect(labelEl.cn[0].id).toBe('new-cb__label');
        expect(labelEl.cn[1].id).toBe('new-cb__input');
        expect(labelEl.cn[2].id).toBe('new-cb__icon');
        expect(labelEl.cn[3].id).toBe('new-cb__value-label');

        checkbox.destroy();
    });

    test('FileUpload internal IDs should sync', async () => {
        const fileUpload = Neo.create(FileUpload, {
            appName,
            id: 'my-file'
        });

        expect(fileUpload.getInputEl().id).toBe('my-file-input');
        // FileUpload also sets the 'for' attribute of the label (index 4)
        expect(fileUpload.vdom.cn[4].for).toBe('my-file-input');

        fileUpload.id = 'new-file';

        expect(fileUpload.getInputEl().id).toBe('new-file-input');
        expect(fileUpload.vdom.cn[4].for).toBe('new-file-input');

        fileUpload.destroy();
    });

    test('Text internal IDs should sync', async () => {
        const text = Neo.create(Text, {
            appName,
            id: 'my-text'
        });

        expect(text.getInputEl().id).toBe('my-text__input');
        expect(text.getLabelEl().id).toBe('my-text__label');
        expect(text.getLabelEl().for).toBe('my-text__input');

        text.id = 'new-text';

        expect(text.getInputEl().id).toBe('new-text__input');
        expect(text.getLabelEl().id).toBe('new-text__label');
        expect(text.getLabelEl().for).toBe('new-text__input');

        text.destroy();
    });
});
