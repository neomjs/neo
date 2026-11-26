import {test, expect}              from '../../fixtures.mjs';
import {attachPageSharedAppWorker} from '../../sharedWorkerAppWorker.mjs';

test.use({serviceWorkers: 'block'});

/**
 * @summary Tests an ordinary update after mount through the real three-thread VDOM pipeline. Main must receive
 * the DOM deltas without relaying the batch's full vnode tree, while App adopts the rendered vnode.
 */
test.describe('Direct VDOM reply', () => {
    for (const shared of [false, true]) {
        test(`${shared ? 'shared' : 'dedicated'} workers render and adopt without a Main tree relay`, async ({browser, context, page, neuralLink}) => {
            await neuralLink.routeConfig(context, config => ({
                ...config,
                useDomApiRenderer: true,
                useServiceWorker : false,
                useSharedWorkers : shared,
                useVdomWorker    : true
            }));
            await page.goto('/examples/button/base/index.html');

            let secondPage;

            await expect(page.locator('.neo-button').first()).toBeVisible({timeout: 30000});
            const app  = await neuralLink.connectToApp('Neo.examples.button.base'),
                  tree = await app.getComponentTree(undefined, 1, true),
                  id   = 'direct-vdom-reply-subject';

            expect(await page.evaluate(() => ({
                enabled: Neo.config.useVdomWorker,
                workers: ['app', 'vdom'].map(name => Neo.worker.Manager.getWorker(name).constructor.name)
            }))).toEqual({enabled: true, workers: [shared ? 'SharedWorker' : 'Worker', shared ? 'SharedWorker' : 'Worker']});

            await app.createComponent(tree.tree.id, {ntype: 'component', id, text: 'Before'});
            await expect(page.locator(`#${id}`)).toHaveText('Before');
            await expect.poll(async () => (await app.getComponent(id, ['vnode'])).vnode?.textContent).toBe('Before');

            if (shared) {
                secondPage = await context.newPage();
                await secondPage.goto('/examples/button/base/index.html');
                await expect(secondPage.locator('.neo-button').first()).toBeVisible({timeout: 30000});
                expect(await secondPage.evaluate(() => Neo.worker.Manager.getWorker('app').constructor.name)).toBe('SharedWorker');

                const firstWorker  = await attachPageSharedAppWorker({browser, page}),
                      secondWorker = await attachPageSharedAppWorker({browser, page: secondPage});

                try {
                    expect(firstWorker?.targetId, 'both windows use the same App SharedWorker').toBeTruthy();
                    expect(secondWorker?.targetId).toBe(firstWorker.targetId)
                } finally {
                    await firstWorker?.close();
                    await secondWorker?.close()
                }
            }

            await page.evaluate(() => {
                const messages = [],
                      update   = data => messages.push(structuredClone(data)),
                      reply    = data => {
                          if (data.data?.updateVdom) messages.push(structuredClone(data))
                      };

                window.__directVdomProbe = {messages, update, reply};
                Neo.worker.Manager.on('message:updateVdom', update);
                Neo.worker.Manager.on('message:reply', reply)
            });

            try {
                await app.setProperties(id, {text: 'After'});
                await expect(page.locator(`#${id}`)).toHaveText('After');
                await expect.poll(async () => (await app.getComponent(id, ['vnode', 'isVdomUpdating'])))
                    .toMatchObject({vnode: {textContent: 'After'}, isVdomUpdating: false});

                const messages = await page.evaluate(() => window.__directVdomProbe.messages),
                      updates  = messages.filter(message => message.action === 'updateVdom' &&
                          message.deltas?.some(delta => delta.id === id && delta.textContent === 'After')),
                      relays   = messages.filter(message => message.action === 'reply' && message.data?.updateVdom &&
                          (message.data.vnode || message.data.vnodes));

                expect(updates.length, 'the changed text reached Main as a delta').toBeGreaterThan(0);
                expect(updates.every(message => message.origin === 'app' && !('vnode' in message) && !('vnodes' in message)))
                    .toBe(true);
                expect(relays, 'Main did not receive an update reply carrying a full vnode tree').toEqual([])
            } finally {
                await page.evaluate(() => {
                    const {update, reply} = window.__directVdomProbe;
                    Neo.worker.Manager.un('message:updateVdom', update);
                    Neo.worker.Manager.un('message:reply', reply);
                    delete window.__directVdomProbe
                });
                await app.removeComponent(id);
                await secondPage?.close()
            }
        })
    }
});
