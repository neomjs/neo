import {setup} from '../../setup.mjs';

const appName = 'LabelTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Label          from '../../../../src/component/Label.mjs';

test.describe('Label Component', () => {
    test('renders its tag, classes, and reactive text', () => {
        const label = Neo.create(Label, {
            appName,
            cls : ['my-label'],
            text: 'Initial text'
        });

        expect(label.vdom.tag).toBe('label');
        expect(label.vdom.cls).toEqual(expect.arrayContaining(['neo-label', 'my-label']));
        expect(label.vdom.text).toBe('Initial text');

        label.text = 'Updated text';

        expect(label.vdom.text).toBe('Updated text');
        label.destroy()
    });

    test('supports module and ntype creation', () => {
        const fromModule = Neo.create({appName, module: Label}),
            fromNtype    = Neo.ntype({appName, ntype: 'label'});

        expect(fromModule.className).toBe('Neo.component.Label');
        expect(fromNtype.className).toBe('Neo.component.Label');

        fromModule.destroy();
        fromNtype.destroy()
    })
});
