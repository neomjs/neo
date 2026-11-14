import {setup} from '../../../../../setup.mjs';

setup({appConfig: {name: 'DocsSourceViewPublicationTest'}});

import {test, expect}      from '@playwright/test';
import Neo                 from '../../../../../../../src/Neo.mjs';
import * as core           from '../../../../../../../src/core/_export.mjs';
import Component           from '../../../../../../../src/component/Base.mjs';
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

test('source arriving during first mount waits for the render carrying its text', async () => {
    const view = Neo.create(Component, {
        appName: 'DocsSourceViewPublicationTest',
        vdom   : {cn: [{tag: 'pre', cn: [{tag: 'code'}]}]}
    });
    let resolveRender, highlights = 0;
    const rendered = new Promise(resolve => {resolveRender = resolve});
    view.syntaxHighlight = () => {highlights++};
    // The initial mount can settle a parked promise before a later source change reaches Main.
    view.promiseUpdate = () => view.mounted ? rendered : view.mountedPromise;

    try {
        const publication = SourceViewComponent.prototype.applySourceCode.call(view, 'const x = 1;');
        view.mounted = true;
        await view.mountedPromise;
        await Promise.resolve();
        expect(highlights).toBe(0);

        resolveRender();
        await publication;
        expect(highlights).toBe(1)
    } finally {
        resolveRender();
        view.destroy()
    }
});

test('destroying a source view before first mount cancels its publication wait', async () => {
    const view = Neo.create(Component, {
        appName: 'DocsSourceViewPublicationTest',
        vdom   : {cn: [{tag: 'pre', cn: [{tag: 'code'}]}]}
    });
    let highlights = 0, updates = 0;
    view.syntaxHighlight = () => {highlights++};
    view.promiseUpdate = () => {updates++; return view.mountedPromise};

    const publication = SourceViewComponent.prototype.applySourceCode.call(view, 'const x = 1;'),
          rejection   = expect(publication).rejects.toBe(Neo.isDestroyed);
    view.destroy();
    await rejection;
    expect(updates).toBe(0);
    expect(highlights).toBe(0)
});
