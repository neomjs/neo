import {setup} from '../../../setup.mjs';

const appName = 'FormFieldInputWidthTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import Text           from '../../../../../src/form/field/Text.mjs';
import ComboBox       from '../../../../../src/form/field/ComboBox.mjs';

test.describe('Neo.form.field input width layout', () => {
    test('Text writes calculated input width to the input node, not the sublabel', () => {
        const field = Neo.create(Text, {
            appName,
            labelWidth: 80,
            width     : 300
        });

        expect(field.vdom.cn[0].width).toBe(80);
        expect(field.vdom.cn[1].width).toBeUndefined();
        expect(field.vdom.cn[2].width).toBe(220);

        field.width = 360;

        expect(field.vdom.cn[1].width).toBeUndefined();
        expect(field.vdom.cn[2].width).toBe(280);

        field.destroy();
    });

    test('ComboBox applies calculated input width to the trigger wrapper', () => {
        const field = Neo.create(ComboBox, {
            appName,
            labelWidth: 100,
            width     : 340,
            store     : {
                data: [
                    {id: 1, name: 'One'},
                    {id: 2, name: 'Two'}
                ]
            }
        });

        expect(field.vdom.cn[1].width).toBeUndefined();
        expect(field.vdom.cn[2].cls).toContain('neo-input-wrapper');
        expect(field.vdom.cn[2].width).toBe(240);

        field.labelWidth = 120;

        expect(field.vdom.cn[1].width).toBeUndefined();
        expect(field.vdom.cn[2].width).toBe(220);

        field.destroy();
    });
});
