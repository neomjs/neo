import { setup } from '../../../setup.mjs';

const appName = 'LayoutFormTest';

setup({
    appConfig: {
        name: appName
    }
});

import { test, expect } from '@playwright/test';
import Neo              from '../../../../../src/Neo.mjs';
import * as core        from '../../../../../src/core/_export.mjs';
import Container        from '../../../../../src/container/Base.mjs';
import Component        from '../../../../../src/component/Base.mjs';
import Legend           from '../../../../../src/component/Legend.mjs';
import FormLayout       from '../../../../../src/layout/Form.mjs';

test.describe('Neo.layout.Form', () => {

    test('Marks a legend, a subfieldset and any other item with their wrapper classes', () => {
        const container = Neo.create(Container, {
            appName,
            layout: {ntype: 'form'},
            items : [
                {module: Legend,    id: 'form-legend', text: 'Legend'},
                {module: Container, id: 'form-fieldset', ntype: 'fieldset'},
                {module: Component, id: 'form-item'}
            ]
        });

        const [legend, fieldset, item] = container.items;

        expect(container.layout).toBeInstanceOf(FormLayout);
        expect(legend.wrapperCls).toContain('neo-layout-form-legend');
        expect(fieldset.wrapperCls).toContain('neo-layout-form-subfieldset');
        expect(item.wrapperCls).toContain('neo-layout-form-item');
    });
});
