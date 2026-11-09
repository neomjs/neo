import {setup} from '../../../../../setup.mjs';

setup({appConfig: {name: 'DocsSourceViewPublicationTest'}});

import {test, expect}      from '@playwright/test';
import Neo                 from '../../../../../../../src/Neo.mjs';
import * as core           from '../../../../../../../src/core/_export.mjs';
import SourceViewComponent from '../../../../../../../docs/app/view/classdetails/SourceViewComponent.mjs';

test('source highlighting waits until the code leaf has been published', async () => {
    let resolveUpdate, highlights = 0;
    const pending = new Promise(resolve => { resolveUpdate = resolve }),
        code      = {},
        view      = {
            vdom   : {cn: [{cn: [code]}]},
            mounted: true,
            update() {},
            promiseUpdate: () => pending,
            syntaxHighlight() { highlights++ }
        };

    const result = SourceViewComponent.prototype.applySourceCode.call(view, 'const x = 1;');

    expect(code.html).toBe('const x = 1;');
    expect(highlights).toBe(0);
    resolveUpdate();
    await result;
    expect(highlights).toBe(1)
});
