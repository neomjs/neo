import {test, expect} from '../../fixtures.mjs';

let moduleSequence = 0;

/**
 * @summary Runs one atomic mutation burst in the real App Worker, leaving the render pipeline intact.
 * Separate Neural Link writes would yield between mutations and lose the ordering under test.
 * @param {import('@playwright/test').Page} page
 * @param {String} source
 * @param {Number} [mainWorkMs=0] A bounded busy Main task while the real workers process their messages.
 * @returns {Promise<void>}
 */
async function runInAppWorker(page, source, mainWorkMs=0) {
    const path  = `data:text/javascript;charset=utf-8,${encodeURIComponent(`${source}\n// sparse-flight-${++moduleSequence}`)}`,
          reply = await page.evaluate(({path, mainWorkMs}) => {
              const pending = Neo.worker.App.loadModule({path}),
                    until   = performance.now() + mainWorkMs;
              // Model a busy render target without pausing or replacing either worker's implementation.
              while (performance.now() < until) {}
              return pending
          }, {path, mainWorkMs});

    expect(reply?.data ?? reply).toMatchObject({success: true})
}

/**
 * @summary Sparse collision coverage through App → VDom → Main → App, including the DOM and adoption.
 * The same natural mutation order runs with dedicated and shared workers. Main's read-only update
 * listener records actual incoming deltas; no Helper, worker transport or DOM application is mocked.
 */
test.describe('Sparse VDOM batch roundtrip', () => {
    for (const shared of [false, true]) {
        for (const mode of ['sparse-excluded', 'sparse-included', 'dense', 'full', 'leapfrog', 'deep-leapfrog', 'dense-boundary', 'late-leapfrog']) {
            test(`${shared ? 'shared' : 'dedicated'} workers: ${mode}`, async ({page, neuralLink}) => {
                await neuralLink.routeConfig(page, config => ({
                    ...config,
                    useDomApiRenderer: true,
                    useSharedWorkers : shared,
                    useVdomWorker    : true
                }));
                await page.goto('/examples/button/base/index.html');

                const app = await neuralLink.connectToApp('Neo.examples.button.base');

                await expect(page.locator('.neo-button').first()).toBeVisible({timeout: 30000});

                const tree = await app.getComponentTree(undefined, 1, true),
                      ids  = ['sparse-nl-a', 'sparse-nl-b', 'sparse-nl-clean'];

                expect(tree.tree.className).toBe('Neo.examples.button.base.MainContainer');
                expect(await page.evaluate(() => ['app', 'vdom'].map(name =>
                    Neo.worker.Manager.getWorker(name).constructor.name)))
                    .toEqual([shared ? 'SharedWorker' : 'Worker', shared ? 'SharedWorker' : 'Worker']);

                const parent = {
                        ntype: 'container', id: 'sparse-nl-parent', layout: 'vbox',
                        items: ids.map((id, index) => ({ntype: 'component', id, text: ['A old', 'B old', 'Clean'][index]}))
                      },
                      branch = mode === 'deep-leapfrog'
                          ? {ntype: 'container', id: 'sparse-nl-bridge', layout: 'vbox', items: [parent]} : parent;

                await app.createComponent(tree.tree.id, {
                    ntype: 'container', id: 'sparse-nl-root', layout: 'vbox', items: [branch]
                });
                await expect(page.locator('#sparse-nl-b')).toHaveText('B old');

                await runInAppWorker(page, `
                    for (const id of ['sparse-nl-root', ${mode === 'deep-leapfrog' ? "'sparse-nl-bridge'," : ''} 'sparse-nl-parent', ...${JSON.stringify(ids)}]) {
                        await Neo.getComponent(id).promiseUpdate();
                    }
                `);
                expect(await app.getComponent('sparse-nl-b', ['vnode', 'needsVdomUpdate', 'isVdomUpdating']))
                    .toMatchObject({vnode: {textContent: 'B old'}, needsVdomUpdate: false, isVdomUpdating: false});

                await page.evaluate(componentIds => {
                    const deltas   = [],
                          nodes    = componentIds.map(id => document.getElementById(id)),
                          listener = data => deltas.push(...structuredClone(Array.isArray(data.deltas) ? data.deltas : [data.deltas]));

                    window.__sparseFlight = {deltas, nodes, listener};
                    Neo.main.DeltaUpdates.on('update', listener)
                }, ids);

                try {
                    await runInAppWorker(page, `
                        const root = Neo.getComponent('sparse-nl-root'),
                              parent = Neo.getComponent('sparse-nl-parent'),
                              a = Neo.getComponent('sparse-nl-a'),
                              b = Neo.getComponent('sparse-nl-b'),
                              mode = ${JSON.stringify(mode)},
                              leapfrog = mode.includes('leapfrog') || mode === 'dense-boundary';
                        let late;
                        if (mode === 'late-leapfrog') {
                            root.beforeExecuteVdomUpdate = () => {
                                delete root.beforeExecuteVdomUpdate;
                                b.setSilent({text: 'B newer'});
                                late = b.promiseUpdate().then(() => root.sparseLateText = b.vnode.textContent);
                            };
                        }
                        root.setSilent({style: {color: 'green'}, updateDepth: leapfrog ? 2 : 1});
                        if (mode !== 'sparse-included') b.setSilent({text: 'B new'});
                        if (!leapfrog) parent.setSilent({style: {color: 'purple'}, updateDepth: mode === 'full' ? -1 : 2});
                        if (mode === 'sparse-included') b.setSilent({text: 'B new'});
                        a.setSilent({text: 'A new'});
                        if (mode === 'dense') parent.denseUpdate = true;
                        if (mode === 'dense-boundary') root.denseUpdate = true;
                        await root.promiseUpdate();
                        if (late) await late;
                    `, mode === 'late-leapfrog' ? 50 : 0);

                    const expectedText = mode === 'late-leapfrog' ? 'B newer' : 'B new';
                    await expect(page.locator('#sparse-nl-b')).toHaveText(expectedText);
                    await expect(page.locator('#sparse-nl-a')).toHaveText('A new');
                    await expect(page.locator('#sparse-nl-clean')).toHaveText('Clean');
                    expect(await app.getComponent('sparse-nl-b', ['text', 'vnode', 'needsVdomUpdate', 'isVdomUpdating']))
                        .toMatchObject({text: expectedText, vnode: {textContent: expectedText}, needsVdomUpdate: false, isVdomUpdating: false});
                    if (mode === 'late-leapfrog') {
                        expect((await app.getComponent('sparse-nl-root', ['sparseLateText'])).sparseLateText).toBe('B newer')
                    }

                    const applied = await page.evaluate(componentIds => ({
                        deltas  : window.__sparseFlight.deltas.filter(delta => componentIds.includes(delta.id)),
                        retained: componentIds.every((id, index) => document.getElementById(id) === window.__sparseFlight.nodes[index])
                    }), ids);

                    expect(applied.deltas.filter(delta => delta.id === 'sparse-nl-b' && delta.textContent === 'B new')).toHaveLength(1);
                    if (mode === 'late-leapfrog') {
                        expect(applied.deltas.filter(delta => delta.id === 'sparse-nl-b' && delta.textContent === 'B newer')).toHaveLength(1)
                    }
                    expect(applied.deltas.filter(delta => delta.id === 'sparse-nl-clean')).toEqual([]);
                    expect(applied.retained).toBe(true);

                    // A subsequent independent flight must use the adopted baseline rather than restore old text.
                    await app.setProperties('sparse-nl-b', {text: 'B later'});
                    await expect(page.locator('#sparse-nl-b')).toHaveText('B later');
                    await expect.poll(async () => (await app.getComponent('sparse-nl-b', ['vnode'])).vnode.textContent)
                        .toBe('B later');
                } finally {
                    await page.evaluate(() => {
                        Neo.main.DeltaUpdates.un('update', window.__sparseFlight.listener);
                        delete window.__sparseFlight
                    });
                    await app.removeComponent('sparse-nl-root')
                }
            });
        }

        for (const [ancestor, distance, scope] of [
            ['sparse', 2, 'finite'], ['sparse', 1, 'finite'], ['sparse', 2, 'full'],
            ['sparse', 2, 'implicit'], ['dense', 2, 'finite'], ['full', 2, 'full']
        ]) {
            test(`${shared ? 'shared' : 'dedicated'} workers: ${ancestor} ancestor, ${scope} hide root at distance ${distance}`, async ({page, neuralLink}) => {
                await neuralLink.routeConfig(page, config => ({...config, useDomApiRenderer: true, useSharedWorkers: shared, useVdomWorker: true}));
                await page.goto('/examples/button/base/index.html');
                const app = await neuralLink.connectToApp('Neo.examples.button.base');
                await expect(page.locator('.neo-button').first()).toBeVisible({timeout: 30000});
                const tree = await app.getComponentTree(undefined, 1, true);
                expect(await page.evaluate(() => ['app', 'vdom'].map(name => Neo.worker.Manager.getWorker(name).constructor.name)))
                    .toEqual([shared ? 'SharedWorker' : 'Worker', shared ? 'SharedWorker' : 'Worker']);

                let branch = {
                    ntype: 'container', id: 'dense-nl-host', layout: 'vbox',
                    items: [
                        {ntype: 'component', id: 'dense-nl-hidden', text: 'Hide me'},
                        {ntype: 'component', id: 'dense-nl-kept', text: 'Keep me'}
                    ]
                };
                if (distance === 2) branch = {ntype: 'container', id: 'dense-nl-bridge', layout: 'vbox', items: [branch]};
                await app.createComponent(tree.tree.id, {ntype: 'container', id: 'dense-nl-root', layout: 'vbox', items: [branch]});
                await expect(page.locator('#dense-nl-hidden')).toHaveText('Hide me');
                await runInAppWorker(page, `
                    for (const id of ['dense-nl-root', ${distance === 2 ? "'dense-nl-bridge'," : ''} 'dense-nl-host', 'dense-nl-hidden', 'dense-nl-kept']) {
                        await Neo.getComponent(id).promiseUpdate();
                    }
                `);
                try {
                    await runInAppWorker(page, `
                        const root = Neo.getComponent('dense-nl-root'),
                              host = Neo.getComponent('dense-nl-host'),
                              hidden = Neo.getComponent('dense-nl-hidden');
                        root.setSilent({style: {color: 'green'}, updateDepth: ${ancestor === 'full' ? -1 : 2}});
                        if (${ancestor === 'dense'}) root.denseUpdate = true;
                        hidden.hide();
                        if (${scope === 'implicit'}) host.denseUpdate = false;
                        if (${scope === 'full'}) host.updateDepth = -1;
                        await root.promiseUpdate();
                    `);
                    await expect(page.locator('#dense-nl-hidden')).toHaveCount(0);
                    await expect(page.locator('#dense-nl-kept')).toHaveText('Keep me');
                    expect(await app.getComponent('dense-nl-hidden', ['hidden', 'mounted', 'vnode']))
                        .toMatchObject({hidden: true, mounted: false, vnode: null});
                    expect(await app.getComponent('dense-nl-host', ['isVdomUpdating'])).toMatchObject({isVdomUpdating: false});
                    await app.callMethod('dense-nl-hidden', 'show');
                    await expect(page.locator('#dense-nl-hidden')).toHaveText('Hide me');
                } finally {
                    await app.removeComponent('dense-nl-root')
                }
            });
        }
    }
});
